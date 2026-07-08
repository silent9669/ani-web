import requests
import re
session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "Referer": "https://allanime.day"
})
try:
    res = session.get("https://allanime.day", timeout=5)
    print("Status:", res.status_code)
    js_files = re.findall(r'src="(/_next/static/chunks/pages/_app-[a-z0-9]+.js)"', res.text)
    if not js_files:
        js_files = re.findall(r'src="(/_next/[^"]+)"', res.text)
    print("JS files:", js_files)
except Exception as e:
    print(e)
