import os
import shutil

def deletePycacheFolders(startPath="."):
    """
    Deletes all __pycache__ directories and their contents recursively 
    starting from the given path.
    """
    for root, dirs, files in os.walk(startPath):
        for dirName in dirs:
            if dirName == "__pycache__":
                pycachePath = os.path.join(root, dirName)
                try:
                    shutil.rmtree(pycachePath)
                    print(f"Deleted: {pycachePath}")
                except Exception as e:
                    print(f"Failed to delete {pycachePath}. Reason: {e}")

if __name__ == "__main__":
    # Replace '.' with the starting directory if different
    deletePycacheFolders(startPath=".")
