# EasyOCR Microservice for Card Settlement System
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import easyocr
import tempfile
import os
import re

app = FastAPI(title="EasyOCR Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize EasyOCR reader
print("Loading EasyOCR models... (this may take a minute on first run)")
reader = easyocr.Reader(['en'], gpu=False)
print("EasyOCR ready!")

def clean_ocr_text(text: str) -> str:
    """Fix common OCR mistakes"""
    # Replace common OCR mistakes for digits
    text = text.replace('O', '0').replace('o', '0')
    text = text.replace('Q', '0')
    text = text.replace('l', '1').replace('I', '1').replace('i', '1')
    return text

def parse_receipt(texts: list) -> dict:
    """Parse extracted text to find receipt fields"""
    full_text = '\n'.join(texts)
    data = {}
    
    print("=== EasyOCR Raw Text ===")
    print(full_text)
    print("========================")
    
    # Terminal ID (TID)
    tid_match = re.search(r'TID[:\s.]*(\d+)', full_text, re.I)
    if tid_match:
        data['terminalId'] = tid_match.group(1)
    
    # Merchant ID (MID)
    mid_match = re.search(r'MID[:\s.]*(\d+)', full_text, re.I)
    if mid_match:
        data['merchantCode'] = mid_match.group(1)
    
    # Receipt Number - clean text first
    receipt_clean = clean_ocr_text(full_text)
    receipt_match = re.search(r'RECEIPT\s*#?\s*[:\s]*(\d+)', receipt_clean, re.I)
    if receipt_match:
        data['invoiceNumber'] = receipt_match.group(1)
        print(f"Found Receipt #: {data['invoiceNumber']}")
    
    # Batch Number - clean text and find digits after BATCH NO
    batch_match = re.search(r'BATCH\s*(?:NO)?\.?\s*[:\s.]*([0OQ\d]{5,})', full_text, re.I)
    if batch_match:
        # Clean the matched batch number
        batch_num = batch_match.group(1)
        batch_num = batch_num.replace('O', '0').replace('o', '0').replace('Q', '0')
        data['batchNumber'] = batch_num
        print(f"Found Batch: {data['batchNumber']}")
    
    # Auth Code / Approval - exactly 6 digits after AUTH
    auth_match = re.search(r'AUTH\s*(?:CODE)?[:\s.]*(\d{6})\b', full_text, re.I)
    if auth_match:
        data['approvalNumber'] = auth_match.group(1)
        print(f"Found Approval: {data['approvalNumber']}")
    
    # STAN (Reference) - clean text
    stan_clean = clean_ocr_text(full_text)
    stan_match = re.search(r'STAN[:\s.]*(\d+)', stan_clean, re.I)
    if stan_match:
        data['rrn'] = stan_match.group(1)
        print(f"Found STAN: {data['rrn']}")
    
    # Card Last 4 Digits - look for 6 digits, asterisks/plus, then 4 digits
    card_match = re.search(r'(\d{4,6})\*+\+?\*?(\d{4})', full_text)
    if card_match:
        data['last4Digits'] = card_match.group(2)
        print(f"Found Card Last 4: {data['last4Digits']}")
    
    # Amount - find the line after AMOUNT that contains EGP
    for i, text in enumerate(texts):
        if 'AMOUNT' in text.upper() and 'T' not in text.upper()[:2]:
            # Look at this text and the next one
            for j in range(i, min(i + 2, len(texts))):
                amount_match = re.search(r'(\d+\.?\d*)', texts[j])
                if amount_match and float(amount_match.group(1)) > 0:
                    data['totalAmount'] = float(amount_match.group(1))
                    print(f"Found Amount: {data['totalAmount']}")
                    break
            break
    
    # Fees
    for i, text in enumerate(texts):
        if 'FEES' in text.upper():
            for j in range(i, min(i + 2, len(texts))):
                fees_match = re.search(r'(\d+\.?\d*)', texts[j])
                if fees_match:
                    data['fees'] = float(fees_match.group(1))
                    break
            break
    
    # Total Amount (T.AMOUNT or TAMOUNT)
    for i, text in enumerate(texts):
        if 'TAMOUNT' in text.upper() or 'T.AMOUNT' in text.upper():
            for j in range(i, min(i + 2, len(texts))):
                tamount_match = re.search(r'(\d+\.?\d*)', texts[j])
                if tamount_match:
                    data['totalPaidAmount'] = float(tamount_match.group(1))
                    break
            break
    
    # Date - DD/MM/YYYY pattern
    date_match = re.search(r'(\d{2}[/-]\d{2}[/-]\d{4})', full_text)
    if date_match:
        data['date'] = date_match.group(1)
        print(f"Found Date: {data['date']}")
    
    # Time - clean text first to fix i->1 mistakes
    time_clean = clean_ocr_text(full_text)
    time_match = re.search(r'(\d{2}:\d{2}:\d{2})', time_clean)
    if time_match:
        data['time'] = time_match.group(1)
        print(f"Found Time: {data['time']}")
    
    # Transaction Status - check if APPROVED or DECLINED
    if 'APPROVED' in full_text.upper():
        data['transactionStatus'] = 'APPROVED'
        print("Transaction Status: APPROVED")
    elif 'DECLINED' in full_text.upper() or 'REJECTED' in full_text.upper():
        data['transactionStatus'] = 'DECLINED'
        print("Transaction Status: DECLINED")
    
    print("=== Extracted Data ===")
    print(data)
    print("======================")
    
    return data

@app.post("/scan")
async def scan_receipt(file: UploadFile = File(...)):
    """Scan receipt image and extract data"""
    with tempfile.NamedTemporaryFile(delete=False, suffix='.jpg') as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    
    try:
        results = reader.readtext(tmp_path)
        texts = [result[1] for result in results]
        raw_text = '\n'.join(texts)
        data = parse_receipt(texts)
        
        return {
            "success": True,
            "data": data,
            "rawText": raw_text
        }
    finally:
        os.unlink(tmp_path)

@app.get("/health")
def health():
    return {"status": "ok", "engine": "EasyOCR"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
