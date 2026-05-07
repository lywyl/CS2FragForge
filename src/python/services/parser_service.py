from demoparser2 import DemoParser
from typing import Dict, Any, List, Tuple, Optional
import pandas as pd
import os


def _spec_player_id_offset(observed_user_ids: Optional[List[int]] = None) -> int:
    """
    将 parse_ticks 的原始 user_id 转换为 console spec_player 实际槽位。

    0-based user_id (含0) → +1 变为 1-based。
    1..10 范围 → +1 与控制台槽位 2..11 对齐（第三方 demo 常见）。
    2..11 / 3..12 范围 → +1 与常见控制台槽位对齐。
    可通过 CS2_SPEC_PLAYER_SLOT_OFFSET 环境变量覆盖。
    """
    raw_env = os.environ.get("CS2_SPEC_PLAYER_SLOT_OFFSET")
    if raw_env is not None:
        try:
            return max(0, int(float(raw_env.strip())))
        except (ValueError, TypeError):
            pass
    if observed_user_ids:
        vals = [int(v) for v in observed_user_ids if int(v) >= 0]
        if not vals:
            return 0
        min_val = min(vals)
        max_val = max(vals)
        # 0-based user_id (contains 0) → +1
        if min_val == 0:
            return 1
        # 1..10 range (third-party demos like 5E) → +1
        if min_val == 1 and max_val == 10:
            return 1
        # 2..11 / 3..12 range → +1
        if min_val >= 2 and max_val >= 11:
            return 1
    return 0


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
                "user_id",
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

    def compute_spec_player_slot(self, player_name: str, tick: int) -> Optional[int]:
        """
        为控制台 spec_player 命令计算正确的槽位编号。

        优先使用 parse_ticks 的 user_id（非 player_death 的 attacker_user_id）
        并应用偏移量。parse_ticks 的 user_id 是 CS2 客户端的内部观战编号，
        而 player_death 事件中的 user_*_id 是另一套编号体系，不能混用。
        """
        raw = str(player_name or "").strip()
        if not raw:
            return None
        target_l = raw.lower()
        tick_i = max(1, int(tick))

        try:
            df = self.parser.parse_ticks(
                ["user_id", "name", "steamid", "team_num"],
                ticks=[tick_i],
            )
        except Exception:
            return None

        if df.empty or "user_id" not in df.columns or "name" not in df.columns:
            return None

        observed: list[int] = []
        uid: Optional[int] = None
        for _, row in df.iterrows():
            nm = str(row.get("name") or "").strip()
            u_val = row.get("user_id")
            u = int(u_val) if u_val is not None and not pd.isna(u_val) else None
            if u is not None and u >= 0:
                observed.append(u)
                if nm.lower() == target_l:
                    uid = u

        if uid is None:
            return None
        offset = _spec_player_id_offset(observed)
        return uid + offset

    def build_spec_slot_map(self, tick: int) -> Dict[str, int]:
        """
        构建玩家名(小写) -> spec_player 槽位的映射。

        在指定 tick 快照上使用 parse_ticks 获取所有玩家的 user_id
        并应用偏移量，返回可直接用于 spec_player 的槽位编号表。
        """
        tick_i = max(1, int(tick))
        try:
            df = self.parser.parse_ticks(
                ["user_id", "name"],
                ticks=[tick_i],
            )
        except Exception:
            return {}

        if df.empty or "user_id" not in df.columns or "name" not in df.columns:
            return {}

        observed: list[int] = []
        name_to_uid: Dict[str, int] = {}
        for _, row in df.iterrows():
            nm = str(row.get("name") or "").strip()
            u_val = row.get("user_id")
            u = int(u_val) if u_val is not None and not pd.isna(u_val) else None
            if nm and u is not None and u >= 0:
                observed.append(u)
                name_to_uid[nm.lower()] = u

        offset = _spec_player_id_offset(observed)
        if offset:
            return {name: uid + offset for name, uid in name_to_uid.items()}
        return name_to_uid

    def get_kill_ticks(self, player_steamid: str, round_num: int) -> List[int]:
        """
        获取指定玩家在指定回合的击杀 tick 列表（升序）。

        从 player_death 事件中提取该玩家作为 attacker 且 non-warmup 的死亡事件，
        返回击杀发生的 tick 列表，用于智能跳跃录制。
        """
        try:
            de = self.parser.parse_events(
                ["player_death"],
                player=["steamid"],
                other=["total_rounds_played", "is_warmup_period"],
            )
            death_df = dict(de).get("player_death")
        except Exception:
            return []

        if death_df is None or death_df.empty:
            return []

        ticks: List[int] = []
        sid_str = str(player_steamid)
        target_trp = max(0, int(round_num) - 1)  # total_rounds_played = round - 1

        for _, row in death_df.iterrows():
            attacker_sid = row.get("attacker_steamid")
            if str(attacker_sid) != sid_str:
                continue
            trp = int(row.get("total_rounds_played", -1))
            if trp != target_trp:
                continue
            warmup = row.get("is_warmup_period")
            if warmup is True:
                continue
            tick = row.get("tick")
            if tick is not None:
                ticks.append(int(tick))

        return sorted(ticks)

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
                            "steamid": str(attacker_sid),
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
                            "steamid": str(user_sid),
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
                    "steamid": str(sid),
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
