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
        tick_rate = service.get_tick_rate()

        # Phase 1: rough detection with spec_slot_map at tick_rate (warmup)
        spec_slot_map = service.build_spec_slot_map(tick=max(1, tick_rate))
        detector = HighlightDetector(events, tick_rate=tick_rate, spec_slot_map=spec_slot_map)
        results = detector.detect_highlights()

        # Phase 2: refine spec_player slot per highlight at the actual kill tick.
        # The slot mapping at tick_rate (warmup) may differ from the in-round
        # mapping (bots slot-shifting, late-joiners).  We rebuild the map at
        # each highlight's first-kill tick so spec_player gets the right numeric
        # slot when the recording seeks there.
        if results:
            # Group by tick to minimise parse_ticks calls
            ticks_to_resolve: dict[int, list[int]] = {}  # tick -> result indices
            for i, r in enumerate(results):
                if r.kill_ticks:
                    ticks_to_resolve.setdefault(r.kill_ticks[0], []).append(i)

            for tick, indices in ticks_to_resolve.items():
                tick_map = service.build_spec_slot_map(tick=max(1, int(tick)))
                if not tick_map:
                    continue
                for idx in indices:
                    r = results[idx]
                    # Refine killer slot
                    slot = tick_map.get(r.player_name.strip().lower())
                    if slot is not None and slot > 0:
                        r.player_userid = slot
                    # Refine victim slots for POV replay
                    if r.kill_details:
                        for kd in r.kill_details:
                            v_slot = tick_map.get(kd.victim_name.strip().lower())
                            if v_slot is not None and v_slot > 0:
                                kd.victim_userid = v_slot

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