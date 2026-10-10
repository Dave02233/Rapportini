from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone
import jwt
import os

security = HTTPBearer()

load_dotenv()

secret = os.getenv("JWT_SECRET_KEY")

if secret is None:
    raise ValueError("JWT_SECRET_KEY is not set")

def create_token(user_id: int, role: str):
    token = jwt.encode(
        {
            "sub": str(user_id),
            "role": str(role),
            "exp": datetime.now(timezone.utc) + timedelta(hours=8)
        },
        secret,
        algorithm="HS256"
    )
    return token

def verify_token(token: str):
    try:
        payload = jwt.decode(token, secret, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise ValueError("Sessione scaduta, effettua di nuovo l'accesso") from None
    except jwt.InvalidTokenError:
        raise ValueError("Sessione non valida, effettua di nuovo l'accesso") from None

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        return verify_token(token)
    except ValueError as e:
        raise HTTPException(status_code=401, detail=str(e)) from e

def require_admin(current_user=Depends(get_current_user)):
    if current_user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Operazione non consentita")
    return current_user
