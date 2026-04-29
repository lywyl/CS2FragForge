from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="CS2 Demo Cutter API")

@app.get("/health")
def health() -> dict:
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765)