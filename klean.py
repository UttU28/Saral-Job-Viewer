from __future__ import annotations

import argparse
import os
from datetime import datetime
from pathlib import Path


rootPath = Path(__file__).resolve().parent

tempDirNames = { "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".tox", ".cache", }
tempFileNames = { ".DS_Store", "Thumbs.db", ".coverage", }
tempFileSuffixes = { ".pyc", ".pyo", ".pyd", ".tmp", ".temp", ".bak", ".swp", ".swo", }
skipDirNames = { ".git", "venv", "venv", "node_modules", }
cleanupRootRelative = Path("zata") / "cleanup"


def isTempFile(path: Path) -> bool:
    return path.name in tempFileNames or path.suffix.lower() in tempFileSuffixes


def timestampNow() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def isInside(child: Path, parent: Path) -> bool:
    try:
        child.relative_to(parent)
        return True
    except ValueError:
        return False


def findCleanupTargets(root: Path) -> tuple[list[Path], list[Path]]:
    dirTargets: list[Path] = []
    fileTargets: list[Path] = []

    for currentRootStr, dirNames, fileNames in os.walk(root, topdown=True):
        currentRoot = Path(currentRootStr)
        currentRelative = currentRoot.relative_to(root)
        if currentRelative == cleanupRootRelative or str(currentRelative).startswith(
            str(cleanupRootRelative) + os.sep
        ):
            dirNames[:] = []
            continue
        # Skip directories that should not be scanned.
        dirNames[:] = [d for d in dirNames if d not in skipDirNames]

        for dirName in list(dirNames):
            if dirName in tempDirNames:
                target = currentRoot / dirName
                dirTargets.append(target)
                # Prevent descending into directories we're already moving.
                dirNames.remove(dirName)

        for fileName in fileNames:
            filePath = currentRoot / fileName
            if isTempFile(filePath):
                fileTargets.append(filePath)

    # Avoid moving files that are already inside a matched temp directory.
    filteredFiles = [
        p for p in fileTargets if not any(isInside(p, d) for d in dirTargets)
    ]
    return sorted(dirTargets), sorted(filteredFiles)


def moveTargets(
    root: Path,
    dirTargets: list[Path],
    fileTargets: list[Path],
    *,
    dryRun: bool,
) -> int:
    totalDirs = len(dirTargets)
    totalFiles = len(fileTargets)
    totalTargets = totalDirs + totalFiles

    if totalTargets == 0:
        print("No temp/cache files found.")
        return 0

    moved = 0

    def removePath(path: Path) -> None:
        nonlocal moved
        if dryRun:
            moved += 1
            return
        if path.is_dir():
            import shutil

            shutil.rmtree(path, ignore_errors=False)
        else:
            path.unlink(missing_ok=True)
        moved += 1

    for dirPath in dirTargets:
        removePath(dirPath)
    for filePath in fileTargets:
        removePath(filePath)

    if dryRun:
        print(
            f"Dry-run: {totalTargets} path(s) would be deleted "
            f"({totalDirs} dirs, {totalFiles} files)."
        )
        return moved

    print(
        f"Done: deleted {moved} path(s) ({totalDirs} dirs, {totalFiles} files)."
    )
    return moved


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Delete __pycache__ and temporary/cache files from the repository."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be moved without changing anything.",
    )
    args = parser.parse_args()

    dirTargets, fileTargets = findCleanupTargets(rootPath)
    moveTargets(rootPath, dirTargets, fileTargets, dryRun=args.dry_run)


if __name__ == "__main__":
    main()
