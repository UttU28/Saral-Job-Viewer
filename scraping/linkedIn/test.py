import os
import shutil
from dotenv import load_dotenv


def _remove_if_exists(path: str):
    if os.path.exists(path):
        os.remove(path)
        print(f"Deleted: {path}")

def clean_python_cache_and_temp_files(project_root: str):
    """
    Remove Python cache folders/files and common temp files from the project.
    """
    removed_count = 0
    temp_suffixes = (".pyc", ".pyo", ".tmp", ".temp", "~")

    for root, dirs, files in os.walk(project_root):
        # Remove __pycache__ directories
        for dir_name in dirs[:]:
            if dir_name == "__pycache__":
                pycache_dir = os.path.join(root, dir_name)
                shutil.rmtree(pycache_dir, ignore_errors=True)
                print(f"Deleted directory: {pycache_dir}")
                removed_count += 1
                dirs.remove(dir_name)

        # Remove common temporary files
        for file_name in files:
            lower_name = file_name.lower()
            if lower_name.endswith(temp_suffixes):
                file_path = os.path.join(root, file_name)
                try:
                    os.remove(file_path)
                    print(f"Deleted temp file: {file_path}")
                    removed_count += 1
                except OSError as exc:
                    print(f"Could not delete temp file {file_path}: {exc}")

    print(f"Cleanup done. Removed {removed_count} cache/temp item(s).")


def reset_sqlite_database():
    """
    Fully reset the local SQLite database for a fresh start.
    This does NOT run migrations; it deletes the DB file and recreates tables.
    """
    load_dotenv()

    db_path = os.getenv("SQLITE_DB_PATH", "data/localDb.sqlite")
    db_path = os.path.abspath(db_path)

    db_dir = os.path.dirname(db_path)
    os.makedirs(db_dir, exist_ok=True)

    print(f"Resetting SQLite database at: {db_path}")

    # Remove main DB and sidecar files if they exist.
    _remove_if_exists(db_path)
    _remove_if_exists(f"{db_path}-wal")
    _remove_if_exists(f"{db_path}-shm")
    _remove_if_exists(f"{db_path}-journal")

    # Recreate tables using current schema.
    from utils.utilsDatabase import Base, engine, initializeDatabaseWithSampleData

    Base.metadata.create_all(engine)
    initializeDatabaseWithSampleData()

    print("Fresh database created successfully.")
    print("You can now run: python .\\linkedInScraping.py")


if __name__ == "__main__":
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    clean_python_cache_and_temp_files(project_root)
    reset_sqlite_database()
