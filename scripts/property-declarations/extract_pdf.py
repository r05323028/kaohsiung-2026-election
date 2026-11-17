#!/usr/bin/env python3
"""Extract reproducible, privacy-bounded page evidence from one official PDF.

This helper deliberately stops at page text and line coordinates. It does not
classify property categories or publish values; those decisions stay in the
reviewed normalized datasets. Output is written outside the repository by the
TypeScript wrapper.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

TEXT_MIN_CHARS = 40


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def package_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def clean_text(value: str) -> str:
    return "\n".join(line.strip() for line in value.splitlines() if line.strip())


def text_lines(text: str) -> list[dict[str, object]]:
    return [{"text": line, "confidence": None, "box": None} for line in text.splitlines() if line]


def ocr_lines(image, engine_name: str) -> tuple[list[dict[str, object]], str, str | None]:
    if engine_name == "rapidocr":
        try:
            import numpy as np
            from rapidocr_onnxruntime import RapidOCR

            engine = RapidOCR()
            result, _ = engine(np.array(image))
            lines: list[dict[str, object]] = []
            for item in result or []:
                box, text, score = item
                if not text:
                    continue
                lines.append(
                    {
                        "text": str(text),
                        "confidence": round(float(score), 4),
                        "box": [
                            int(round(float(point[0]))) for point in box
                        ],
                    }
                )
            return lines, "rapidocr", package_version("rapidocr-onnxruntime")
        except Exception:
            pass

    if shutil.which("tesseract"):
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as handle:
            image.save(handle.name)
            image_path = handle.name
        try:
            completed = subprocess.run(
                [
                    "tesseract",
                    image_path,
                    "stdout",
                    "-l",
                    "chi_tra+eng",
                    "--psm",
                    "6",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            lines = [
                {"text": line, "confidence": None, "box": None}
                for line in completed.stdout.splitlines()
                if line.strip()
            ]
            return lines, "tesseract", package_version("tesseract") or "5.x"
        finally:
            Path(image_path).unlink(missing_ok=True)

    return [], "none", None


def extract(pdf_path: Path, scale: float, max_pages: int | None) -> dict[str, object]:
    import pymupdf
    from PIL import Image

    document = pymupdf.open(pdf_path)
    page_count = document.page_count
    limit = page_count if max_pages is None else min(page_count, max_pages)
    pages: list[dict[str, object]] = []
    for index in range(limit):
        page = document[index]
        raw_text = page.get_text("text")
        native_text = clean_text(raw_text if isinstance(raw_text, str) else "")
        if len(native_text) >= TEXT_MIN_CHARS:
            pages.append(
                {
                    "pageNumber": index + 1,
                    "width": round(float(page.rect.width), 2),
                    "height": round(float(page.rect.height), 2),
                    "source": "text-layer",
                    "tool": "pymupdf",
                    "toolVersion": package_version("pymupdf"),
                    "renderScale": None,
                    "text": native_text,
                    "lines": text_lines(native_text),
                }
            )
            continue

        pixmap = page.get_pixmap(
            matrix=pymupdf.Matrix(scale, scale), alpha=False
        )
        image = Image.frombytes(
            "RGB", (pixmap.width, pixmap.height), pixmap.samples
        )
        lines, tool, version = ocr_lines(image, "rapidocr")
        text = "\n".join(str(line["text"]) for line in lines)
        pages.append(
            {
                "pageNumber": index + 1,
                "width": round(float(page.rect.width), 2),
                "height": round(float(page.rect.height), 2),
                "source": "ocr",
                "tool": tool,
                "toolVersion": version,
                "renderScale": scale,
                "text": text,
                "lines": lines,
            }
        )

    return {
        "schemaVersion": 1,
        "pdfSha256": sha256_file(pdf_path),
        "physicalPageCount": page_count,
        "extractedPageCount": limit,
        "pages": pages,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--scale", type=float, default=3.0)
    parser.add_argument("--max-pages", type=int)
    args = parser.parse_args()

    if args.scale <= 0:
        parser.error("--scale must be positive")
    if args.max_pages is not None and args.max_pages <= 0:
        parser.error("--max-pages must be positive")

    output = extract(args.pdf, args.scale, args.max_pages)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(output, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
