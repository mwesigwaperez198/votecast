import hashlib
import secrets
import json
from datetime import datetime

def generate_session_token():
    return secrets.token_urlsafe(32)

def generate_vote_hash(voter_id, contestant_id, voter_type, timestamp):
    data = f"{voter_id}:{contestant_id}:{voter_type}:{timestamp}:{secrets.token_hex(8)}"
    return hashlib.sha256(data.encode()).hexdigest()

def log_to_dict(log_entry):
    try:
        return json.loads(log_entry.data) if log_entry.data else {}
    except:
        return {}
