import os
import re
import tempfile
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from paddleocr import PaddleOCR

app = FastAPI(title="PaddleOCR Hybrid Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize PaddleOCR
# 'ar' supports Arabic + English
print("Initializing PaddleOCR...")
# Note: On first run, this will download the models (about 20MB)
try:
    ocr_engine = PaddleOCR(use_angle_cls=True, lang='ar', show_log=False)
    print("PaddleOCR ready!")
except Exception as e:
    print(f"Error initializing PaddleOCR: {e}")
    ocr_engine = None

def clean_text(text: str) -> str:
    """Basic text cleanup"""
    if not text: return ""
    # Fix common OCR swaps
    text = text.replace('O', '0').replace('o', '0').replace('Q', '0')
    text = text.replace('l', '1').replace('I', '1').replace('i', '1')
    return text.strip()

def parse_receipt(text_lines: list) -> dict:
    """Parse lines into structured data"""
    full_text = '\n'.join(text_lines)
    data = {}
    
    # 1. Merchant Code (MID) - 8-15 digits
    mid_match = re.search(r'(?:MID|Merchant|Merch|ID)[:\s]*(\d{8,15})', full_text, re.I)
    if mid_match: data['merchantCode'] = mid_match.group(1)
    
    # 2. Terminal ID (TID) - 8 digits
    tid_match = re.search(r'(?:TID|Terminal|Term)[:\s]*(\d{8})', full_text, re.I)
    if tid_match: data['terminalId'] = tid_match.group(1)
    
    # 3. Batch Number
    batch_match = re.search(r'(?:Batch|الباتش)\s*(?:NO|#)?[:\s]*(\d{1,6})', full_text, re.I)
    if batch_match: data['batchNumber'] = batch_match.group(1)
    
    # 4. Approval Number
    auth_match = re.search(r'(?:Auth|Approval|Appr|الموافقة)\s*(?:CODE|NO)?[:\s]*(\d{6})', full_text, re.I)
    if auth_match: data['approvalNumber'] = auth_match.group(1)
    
    # 5. Amount
    # Clean full_text for amount search (remove spaces between digits and dots)
    clean_amt_text = re.sub(r'(\d)\s+([.,])\s+(\d)', r'\1\2\3', full_text)
    
    # Strategy: Find lines with keywords, then search for amounts
    keywords = ['TOTAL', 'AMOUNT', 'SALE', 'الاجمالي', 'المبلغ', 'صافي']
    for i, line in enumerate(text_lines):
        if any(k in line.upper() for k in keywords):
            # Search in current line, then next 2 lines
            search_window = '\n'.join(text_lines[i:i+3])
            m = re.search(r'(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})', search_window)
            if m:
                val = m.group(1).replace(',', '')
                if '.' in val and val.count('.') > 1: # Handle 1.250.00 -> 1250.00
                    parts = val.split('.')
                    val = ''.join(parts[:-1]) + '.' + parts[-1]
                data['totalAmount'] = float(val)
                break

    # Fallback: Find largest amount
    if 'totalAmount' not in data:
        all_amounts = re.findall(r'(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})', full_text)
        if all_amounts:
            parsed_amts = []
            for a in all_amounts:
                try:
                    v = a.replace(',', '')
                    if v.count('.') > 1:
                        parts = v.split('.')
                        v = ''.join(parts[:-1]) + '.' + parts[-1]
                    parsed_amts.append(float(v))
                except: continue
            if parsed_amts: data['totalAmount'] = max(parsed_amts)

    # 6. Date (DD/MM/YYYY or DD-MM-YYYY)
    date_match = re.search(r'(\d{2}[/-]\d{2}[/-]\d{2,4})', full_text)
    if date_match:
        d = date_match.group(1).replace('/', '-')
        parts = d.split('-')
        if len(parts) == 3:
            day, month, year = parts
            if len(year) == 2: year = f"20{year}"
            # If accidentally swapped (YYYY-MM-DD or something else)
            if len(day) == 4: year, day = day, year
            data['date'] = f"{year}-{month.zfill(2)}-{day.zfill(2)}"

    # 7. Last 4 Digits
    card_match = re.search(r'(\d{4,6})[\*xX \.]+(\d{4})', full_text)
    if card_match: data['last4Digits'] = card_match.group(2)
    
    # 8. RRN
    rrn_match = re.search(r'(?:RRN|Ref|Reference)[:\s]*(\d{12})', full_text, re.I)
    if rrn_match: data['rrn'] = rrn_match.group(1)

    return data

@app.post("/scan")
async def scan_receipt(file: UploadFile = File(...)):
    """Scan using PaddleOCR"""
    if ocr_engine is None:
        return {"success": False, "error": "OCR engine not initialized"}

    save_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as tmp:
            content = await file.read()
            tmp.write(content)
            save_path = tmp.name
        
        # PaddleOCR inference
        # result is a list of lists: [[ [box], (text, score) ], ...]
        result = ocr_engine.ocr(save_path, cls=True)
        
        text_lines = []
        if result and result[0]:
            for line in result[0]:
                text_lines.append(line[1][0])
        
        raw_text = '\n'.join(text_lines)
        data = parse_receipt(text_lines)
        
        return {
            "success": True,
            "data": data,
            "rawText": raw_text,
            "engine": "PaddleOCR"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}
    finally:
        if save_path and os.path.exists(save_path):
            os.unlink(save_path)

@app.get("/health")
def health():
    return {"status": "ok", "engine": "PaddleOCR" if ocr_engine else "Not Initialized"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
