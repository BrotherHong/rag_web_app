"""PDF 網址 OCR 校正

MinerU 對圖片式 PDF 做 OCR 時會把網址字元認錯（housing-osa→housing-0sa、
reurl.cc→reurl.c、apply/→apply/l），壞網址被 LLM 照抄成死連結。
本模組以「同一份 PDF 的文字層」為真值（內嵌真文字、非 OCR）保守校正。

規則（安全優先：對的絕不動、沒把握就保留）：
  R1 與真值完全相同        → 保留
  R2 距離≤2、同網站、唯一  → 替換（如 housing-0sa→housing-osa）
  A2 主機離已知網域≤1      → 先修主機再跑一次 ≤2 的 A1（兩段式，門檻仍≤2；
                            如 reurl.c/zlakk→reurl.cc/zlaaKk）
  其餘（含純掃描無文字層）  → 保留
"""

import re

# RFC 3986 合法字元；中文等字元會自然中斷比對
_URL_RE = re.compile(r"https?://[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+")
# 網址尾端可能沾到的包裝/標點（非網址本體）
_TRAIL = "。，、）)】》「」『』.,;!?'\" °"

_A1_MAX_DIST = 2  # G2：OCR 局部錯誤的絕對上限


def _lev(a: str, b: str) -> int:
    if a == b:
        return 0
    la, lb = len(a), len(b)
    if not la or not lb:
        return la or lb
    prev = list(range(lb + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[-1] + 1, prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[lb]


def _clean(u: str) -> str:
    return u.rstrip(_TRAIL)


def _host(u: str) -> str:
    m = re.match(r"https?://([^/]+)", u)
    return m.group(1) if m else ""


def _is_complete(u: str) -> bool:
    """只有「完整可信」的文字層網址才進真值字典，避免拿被切斷的半條當真值。"""
    host = _host(u)
    if "." not in host:            # 排除 https://stu- 這種殘料
        return False
    tail = u.rstrip("/")
    if tail and tail[-1] in "-=&?_,":  # 排除 …/p/412- 這種懸空結尾
        return False
    return True


def _build_truth(pdf_path) -> tuple[list[str], set[str]]:
    """從 PDF 文字層建：真值字典 D（完整網址）、已知主機集 K。"""
    from pdfminer.high_level import extract_text
    try:
        text = extract_text(str(pdf_path)) or ""
    except Exception:
        return [], set()
    seen, D = set(), []
    for m in _URL_RE.findall(text):
        u = _clean(m)
        if u and u not in seen and _is_complete(u):
            seen.add(u)
            D.append(u)
    K = {_host(u) for u in D}
    return D, K


def _decide(u: str, D: list[str], K: set[str]) -> str:
    """回傳校正後的網址（不需校正則回傳原值）。"""
    if u in D:                                  # R1
        return u
    cands = [
        d for d in D
        if _lev(u, d) > 0
        and (_host(u) == _host(d) or _lev(_host(u), _host(d)) <= 1)   # G1
        and _lev(u, d) <= _A1_MAX_DIST                                # G2
    ]
    if len(cands) == 1:                         # R2 + G3
        return cands[0]
    if len(cands) > 1:                          # 多條近似 → 放棄
        return u
    host = _host(u)                             # A2 主機兜底
    if host and host not in K:
        near = [k for k in K if _lev(host, k) == 1]
        if len(near) == 1:
            u2 = u.replace(host, near[0], 1)
            # 主機修好後誤差變小，用更乾淨的 u2 再跑一次 A1（門檻仍 ≤2）
            if u2 in D:
                return u2
            cands2 = [
                d for d in D
                if 0 < _lev(u2, d) <= _A1_MAX_DIST
                and (_host(u2) == _host(d) or _lev(_host(u2), _host(d)) <= 1)
            ]
            if len(cands2) == 1:
                return cands2[0]
            return u2                            # 至少主機修好
    return u                                     # R3 保留


def correct_urls(text: str, pdf_path) -> str:
    """用 pdf_path 的文字層校正 text 中被 OCR 弄壞的網址，回傳校正後的 text。

    找不到文字層（純掃描 PDF）時 D 為空，全部原樣保留。
    """
    D, K = _build_truth(pdf_path)
    if not D:
        return text

    def _repl(m: re.Match) -> str:
        raw = m.group(0)
        cleaned = _clean(raw)
        trailing = raw[len(cleaned):]           # 保留尾端沾到的標點（如結尾的 ")"）
        return _decide(cleaned, D, K) + trailing

    return _URL_RE.sub(_repl, text)
