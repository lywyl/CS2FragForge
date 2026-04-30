from pydantic import BaseModel
from typing import List, Optional


class ParseDemoRequest(BaseModel):
    demo_path: str


class HighlightResult(BaseModel):
    type: str  # "3K", "4K", "ACE", "CLUTCH", "ECO_WIN"
    player_name: str
    player_steamid: int
    round: int
    tick_start: int
    tick_end: int
    kill_count: int
    weapons: List[str]
    score: float
    headshot_count: Optional[int] = None


class PlayerInfoResult(BaseModel):
    name: str
    steamid: int
    team: str
    kills: int
    deaths: int


class GameInfoResult(BaseModel):
    map_name: str
    tick_rate: int
    total_counted_rounds: int
    players: List[PlayerInfoResult]


class ParseDemoResponse(BaseModel):
    header: dict
    events: dict
