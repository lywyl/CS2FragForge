from pydantic import BaseModel
from typing import List, Optional


class KillDetail(BaseModel):
    """Per-kill victim info for POV replay segments."""
    tick: int                          # tick when the kill occurred
    victim_name: str                   # victim player name
    victim_steamid: str                # victim SteamID64 (string to avoid JS precision loss)
    victim_userid: int = 0             # victim spec_player slot (computed later)
    weapon: str = ""                   # weapon used
    headshot: bool = False             # was it a headshot


class ParseDemoRequest(BaseModel):
    demo_path: str


class HighlightResult(BaseModel):
    type: str  # "3K", "4K", "ACE", "CLUTCH", "ECO_WIN"
    player_name: str
    player_steamid: str  # string to avoid JS precision loss (> 2^53)
    player_userid: int  # engine-internal user_id for spec_player (parse_ticks + offset)
    round: int
    tick_start: int
    tick_end: int
    kill_count: int
    weapons: List[str]
    score: float
    headshot_count: Optional[int] = None
    kill_ticks: Optional[List[int]] = None  # 每次击杀的 tick，用于智能跳跃录制
    kill_details: Optional[List[KillDetail]] = None  # 每次击杀的受害者信息，用于 POV 回放


class PlayerInfoResult(BaseModel):
    name: str
    steamid: str  # string to avoid JS precision loss
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
