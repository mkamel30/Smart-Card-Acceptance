/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                primary: '#3B82F6',
                secondary: '#64748B',
                success: '#22C55E',
                warning: '#F59E0B',
                error: '#EF4444',
            },
        },
    },
    plugins: [],
}
