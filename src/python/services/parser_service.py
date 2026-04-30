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

        # Get total counted rounds from round_end events
        try:
            events = self.parser.parse_events(
                ["round_end"],
                other=["total_rounds_played"],
            )
            events_dict = dict(events)
            round_end_df = events_dict.get("round_end")
            if round_end_df is not None and len(round_end_df) > 0:
                total_counted_rounds = int(round_end_df["total_rounds_played"].max())
            else:
                total_counted_rounds = 0
        except Exception:
            total_counted_rounds = 0

        # Get player kills/deaths from player_death events
        try:
            death_events = self.parser.parse_events(
                ["player_death"],
                player=["name", "steamid", "team_name"],
            )
            death_dict = dict(death_events)
            death_df = death_dict.get("player_death")
        except Exception:
            death_df = None

        # Build player stats from player_death events
        player_stats: Dict[str, Dict[str, Any]] = {}

        if death_df is not None and len(death_df) > 0:
            # Columns: attacker_name, attacker_steamid, attacker_team_name,
            #           user_name, user_steamid, user_team_name
            for _, row in death_df.iterrows():
                # Attacker gets a kill
                attacker_name = row.get("attacker_name")
                attacker_sid = row.get("attacker_steamid")
                attacker_team = row.get("attacker_team_name")
                if attacker_name and attacker_sid:
                    key = str(attacker_sid)
                    if key not in player_stats:
                        player_stats[key] = {
                            "name": attacker_name,
                            "steamid": int(attacker_sid),
                            "team": attacker_team or "",
                            "kills": 0,
                            "deaths": 0,
                        }
                    player_stats[key]["kills"] += 1
                    if attacker_team and not player_stats[key]["team"]:
                        player_stats[key]["team"] = attacker_team

                # Victim gets a death
                user_name = row.get("user_name")
                user_sid = row.get("user_steamid")
                user_team = row.get("user_team_name")
                if user_name and user_sid:
                    key = str(user_sid)
                    if key not in player_stats:
                        player_stats[key] = {
                            "name": user_name,
                            "steamid": int(user_sid),
                            "team": user_team or "",
                            "kills": 0,
                            "deaths": 0,
                        }
                    player_stats[key]["deaths"] += 1
                    if user_team and not player_stats[key]["team"]:
                        player_stats[key]["team"] = user_team

        # Fill in any players from parse_player_info that weren't in death events
        raw_players = self.parse_player_info()
        for p in raw_players:
            sid = p.get("steamid")
            if sid is None:
                continue
            key = str(sid)
            if key not in player_stats:
                player_stats[key] = {
                    "name": p.get("name", "Unknown"),
                    "steamid": int(sid),
                    "team": "",
                    "kills": 0,
                    "deaths": 0,
                }

        players = list(player_stats.values())

        return {
            "map_name": header.get("map_name", "unknown"),
            "tick_rate": self.get_tick_rate(),
            "total_counted_rounds": total_counted_rounds,
            "players": players,
        }
