from fastapi import FastAPI, HTTPException
from src.python.models import ParseDemoRequest, ParseDemoResponse, HighlightResult, GameInfoResult
from src.python.services.parser_service import ParserService
from src.python.services.highlight_detector import HighlightDetector
from typing import List

app = FastAPI(title="CS2 Demo Cutter API")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/parse_demo")
def parse_demo(req: ParseDemoRequest) -> ParseDemoResponse:
    try:
        service = ParserService(req.demo_path)
        header = service.parse_header()
        events = service.parse_events()
        return ParseDemoResponse(header=header, events=events)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/detect_highlights")
def detect_highlights(req: ParseDemoRequest) -> List[HighlightResult]:
    try:
        service = ParserService(req.demo_path)
        events = service.parse_events()
        detector = HighlightDetector(events, tick_rate=service.get_tick_rate())
        results = detector.detect_highlights()
        return [HighlightResult(**r.model_dump() if hasattr(r, 'model_dump') else r) for r in results]
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/game_info")
def game_info(req: ParseDemoRequest) -> GameInfoResult:
    try:
        service = ParserService(req.demo_path)
        info = service.get_game_info()
        return GameInfoResult(**info)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765)