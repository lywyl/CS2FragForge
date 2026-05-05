from pydantic import BaseModel
from typing import List, Optional


class ParseDemoRequest(BaseModel):
    demo_path: str


class HighlightResult(BaseModel):
    type: str  # "3K", "4K", "ACE", "CLUTCH", "ECO_WIN"
    player_name: str
    player_steamid: int
    player_userid: int  # engine-internal user_id for spec_player (parse_ticks + offset)
    round: int
    tick_start: int
    tick_end: int
    kill_count: int
    weapons: List[str]
    score: float
    headshot_count: Optional[int] = None
    kill_ticks: Optional[List[int]] = None  # 每次击杀的 tick，用于智能跳跃录制


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
