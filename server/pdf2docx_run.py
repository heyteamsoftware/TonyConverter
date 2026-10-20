"""Gallardito Converter: PDF -> DOCX con pdf2docx.

Uso: pdf2docx_run.py ENTRADA.pdf SALIDA.docx MAX_PAGINAS
Códigos de salida: 0 bien, 3 protegido con contraseña, 4 demasiadas páginas,
5 sin texto (escaneado), 1 otro error.
"""
import logging
import sys
import warnings

warnings.filterwarnings("ignore")
logging.disable(logging.CRITICAL)

import pymupdf  # noqa: E402
from pdf2docx import Converter  # noqa: E402


def main() -> int:
    src, dst, max_pages = sys.argv[1], sys.argv[2], int(sys.argv[3])

    with pymupdf.open(src) as doc:
        if doc.needs_pass:
            return 3
        if doc.page_count > max_pages:
            return 4
        if not any(page.get_text("text").strip() for page in doc):
            return 5

    cv = Converter(src)
    try:
        cv.convert(dst, multi_processing=False)
    finally:
        cv.close()
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.exit(1)
