# Python script to spawn a shell using pty module
import pty

def spawn_sh():
    pty.spawn("/bin/sh")

def spawn_bash():
    pty.spawn("/bin/bash")

if __name__ == "__main__":
    choice = input("Choose shell (sh/bash): ").strip()
    if choice == "sh":
        spawn_sh()
    elif choice == "bash":
        spawn_bash()
    else:
        print("Invalid choice")