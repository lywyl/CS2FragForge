from demoparser2 import DemoParser
from typing import Dict, Any, List, Tuple, Optional
import pandas as pd


class ParserService:
    def __init__(self, demo_path: str):
        self.parser = DemoParser(demo_path)
        self._header: Optional[Dict[str, Any]] = None
        self._tick_rate: Optional[int] = None
        self._player_info: Optional[pd.DataFrame] = None

    def parse_header(self) -> Dict[str, Any]:
        if self._header is None:
            self._header = self.parser.parse_header()
        return self._header

    def parse_events(
        self,
        event_names: Optional[List[str]] = None,
        player_props: Optional[List[str]] = None,
        other_props: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        if event_names is None:
            event_names = [
                "player_death",
                "round_end",
                "round_start",
                "bomb_planted",
                "bomb_defused",
                "round_mvp",
            ]
        if player_props is None:
            player_props = [
                "X",
                "Y",
                "Z",
                "active_weapon_name",
                "is_headshot",
                "team_name",
                "name",
                "steamid",
            ]
        if other_props is None:
            other_props = ["total_rounds_played", "game_time", "is_warmup_period"]

        raw_events = self.parser.parse_events(event_names, player=player_props, other=other_props)
        # raw_events is List[Tuple[str, DataFrame]]
        result: Dict[str, Any] = {}
        for name, df in raw_events:
            # Convert DataFrame to list of dicts for JSON serialization
            # Replace NaN with None
            records = df.where(pd.notnull(df), None).to_dict(orient="records")
            result[name] = records
        return result

    def parse_player_info(self) -> List[Dict[str, Any]]:
        if self._player_info is None:
            self._player_info = self.parser.parse_player_info()
        df = self._player_info
        return df.where(pd.notnull(df), None).to_dict(orient="records")

    def get_tick_rate(self) -> int:
        if self._tick_rate is not None:
            return self._tick_rate

        # Infer tick rate by comparing tick differences with game_time differences
        # Use round_start and round_end events
        try:
            events = self.parser.parse_events(
                ["round_start", "round_end"],
                other=["total_rounds_played", "game_time"],
            )
            events_dict = dict(events)
            rs = events_dict.get("round_start")
            re = events_dict.get("round_end")
            if rs is not None and re is not None and len(rs) > 0 and len(re) > 0:
                # Match round_start and round_end by total_rounds_played
                for _, start_row in rs.iterrows():
                    round_num = start_row["total_rounds_played"]
                    matching_end = re[re["total_rounds_played"] == round_num + 1]
                    if len(matching_end) > 0:
                        end_row = matching_end.iloc[0]
                        tick_diff = int(end_row["tick"] - start_row["tick"])
                        time_diff = float(end_row["game_time"] - start_row["game_time"])
                        if time_diff > 0:
                            inferred = round(tick_diff / time_diff)
                            # CS2 common tick rates: 64, 128
                            if inferred in (64, 128):
                                self._tick_rate = inferred
                                return self._tick_rate
                            # If close to 64 or 128, round to nearest
                            if abs(inferred - 64) < abs(inferred - 128):
                                self._tick_rate = 64
                            else:
                                self._tick_rate = 128
                            return self._tick_rate
        except Exception:
            pass

        # Default to 64 (most common for CS2 matchmaking)
        self._tick_rate = 64
        return self._tick_rate

    def tick_to_seconds(self, tick: int) -> float:
        return tick / self.get_tick_rate()

    def get_map_name(self) -> str:
        header = self.parse_header()
        return header.get("map_name", "unknown")

    def get_game_info(self) -> Dict[str, Any]:
        header = self.parse_header()
        players = self.parse_player_info()
        return {
            "map_name": header.get("map_name", "unknown"),
            "server_name": header.get("server_name", ""),
            "demo_version": header.get("demo_version_name", ""),
            "tick_rate": self.get_tick_rate(),
            "players": players,
        }
