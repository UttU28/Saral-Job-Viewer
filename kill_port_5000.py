import subprocess
import re
import os
import sys

def find_and_kill_process_on_port(port):
    print(f"Looking for processes using port {port}...")
    
    # Find process using the port
    try:
        # Using netstat to find the process ID
        result = subprocess.check_output(f'netstat -ano | findstr :{port}', shell=True).decode()
        print(f"Found connections on port {port}:")
        print(result)
        
        # Extract PID using regex
        pid_pattern = r'LISTENING\s+(\d+)'
        pids = re.findall(pid_pattern, result)
        
        if not pids:
            # Try alternative pattern for ESTABLISHED connections
            pid_pattern = r'ESTABLISHED\s+(\d+)'
            pids = re.findall(pid_pattern, result)
            
        if not pids:
            # Try to find any PID in the last column
            pid_pattern = r'[\s:]+(\d+)$'
            pids = []
            for line in result.splitlines():
                match = re.search(pid_pattern, line.strip())
                if match:
                    pids.append(match.group(1))
            
        if not pids:
            print(f"No processes found using port {port}")
            return False
        
        # Remove duplicates
        unique_pids = list(set(pids))
        
        # Get process name for each PID
        for pid in unique_pids:
            try:
                process_info = subprocess.check_output(f'tasklist /fi "PID eq {pid}"', shell=True).decode()
                print(f"\nProcess with PID {pid}:")
                print(process_info)
                
                subprocess.check_output(f'taskkill /F /PID {pid}', shell=True)
                print(f"Process with PID {pid} has been terminated.")
            except subprocess.CalledProcessError:
                print(f"Could not get info for PID {pid}")
        
        return True
    except subprocess.CalledProcessError:
        print(f"No processes found using port {port}")
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    port = 5000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"Invalid port number: {sys.argv[1]}")
            sys.exit(1)
    
    print(f"Searching for processes using port {port}...")
    
    # Check for admin privileges
    if os.name == 'nt':  # Windows
        try:
            # This will raise an error if not admin
            is_admin = os.getuid() == 0
        except AttributeError:
            import ctypes
            is_admin = ctypes.windll.shell32.IsUserAnAdmin() != 0
            
        if not is_admin:
            print("Warning: Running without admin privileges may limit the ability to kill some processes.")
    
    # Find and kill the process
    if not find_and_kill_process_on_port(port):
        print(f"No processes found using port {port} or unable to terminate them.")
        
    print("\nYou can now try to start your application again.") 