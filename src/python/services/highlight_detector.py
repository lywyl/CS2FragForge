from typing import List, Dict, Any, Optional, Set, Tuple
from src.python.models import HighlightResult, KillDetail


class HighlightDetector:
    def __init__(
        self,
        events: Dict[str, List[Dict[str, Any]]],
        tick_rate: int = 64,
        spec_slot_map: Optional[Dict[str, int]] = None,
    ):
        self.events = events
        self.tick_rate = tick_rate
        # 玩家名(小写) -> spec_player 控制台槽位，来自 parse_ticks + offset
        self.spec_slot_map = spec_slot_map or {}
        self._deaths: Optional[List[Dict[str, Any]]] = None
        self._round_ends: Optional[List[Dict[str, Any]]] = None
        self._round_starts: Optional[List[Dict[str, Any]]] = None

    def _get_spec_slot(self, player_name: str, fallback_userid: int) -> int:
        """
        获取 spec_player 命令所用的槽位编号。

        优先使用 parse_ticks 构建的 spec_slot_map，
        回退到传入的 fallback_userid (来自 player_death 事件，可能偏移 1)。
        """
        if self.spec_slot_map:
            slot = self.spec_slot_map.get(str(player_name or "").strip().lower())
            if slot is not None:
                return slot
        # fallback：player_death 的 user_id 通常需要 +1 偏移
        return max(0, int(fallback_userid))

    @property
    def deaths(self) -> List[Dict[str, Any]]:
        if self._deaths is None:
            self._deaths = self.events.get("player_death", [])
        return self._deaths

    @property
    def round_ends(self) -> List[Dict[str, Any]]:
        if self._round_ends is None:
            self._round_ends = self.events.get("round_end", [])
        return self._round_ends

    @property
    def round_starts(self) -> List[Dict[str, Any]]:
        if self._round_starts is None:
            self._round_starts = self.events.get("round_start", [])
        return self._round_starts

    def _is_warmup(self, event: Dict[str, Any]) -> bool:
        """Check if event occurred during warmup."""
        if event.get("is_warmup_period") is True:
            return True
        # total_rounds_played == 0 usually indicates warmup/pre-match
        if event.get("total_rounds_played") == 0:
            return True
        return False

    def _is_valid_kill(self, death: Dict[str, Any]) -> bool:
        """Exclude team kills and suicides."""
        attacker_team = death.get("attacker_team_name")
        victim_team = death.get("user_team_name")
        attacker_name = death.get("attacker_name")
        victim_name = death.get("user_name")
        weapon = death.get("weapon", "")

        # Team kill
        if attacker_team and victim_team and attacker_team == victim_team:
            return False

        # Suicide (self-kill or world damage)
        if attacker_name and victim_name and attacker_name == victim_name:
            return False
        if weapon in ("world", "worldspawn", "trigger_hurt", "c4"):
            # c4 is the bomb killing the planter — could be considered suicide
            return False

        # Bot kills (no steamid)
        if not death.get("attacker_steamid"):
            return False

        return True

    def _get_round_winner(self, total_rounds_played: int) -> Optional[str]:
        """Get winner for a given round number."""
        for re in self.round_ends:
            if re.get("total_rounds_played") == total_rounds_played:
                winner = re.get("winner")
                if winner and str(winner).upper() in ("CT", "T", "TERRORIST"):
                    return str(winner).upper()
        return None

    def _get_round_end_tick(self, total_rounds_played: int) -> Optional[int]:
        for re in self.round_ends:
            if re.get("total_rounds_played") == total_rounds_played:
                tick = re.get("tick")
                if tick is not None:
                    return int(tick)
        return None

    def detect_highlights(self) -> List[HighlightResult]:
        """Detect all highlights and return sorted by score (desc)."""
        highlights: List[HighlightResult] = []
        highlights.extend(self.detect_multi_kills())
        highlights.extend(self.detect_clutches())
        highlights.extend(self.detect_eco_wins())

        # Deduplicate: same player + same round = keep highest score
        seen: Dict[Tuple[int, str, str], HighlightResult] = {}
        for hl in highlights:
            key = (hl.round, hl.player_steamid, hl.type)
            if key not in seen or hl.score > seen[key].score:
                seen[key] = hl

        result = list(seen.values())
        result.sort(key=lambda x: x.score, reverse=True)
        return result

    def _get_round_number(self, event: Dict[str, Any]) -> int:
        """Convert event total_rounds_played to actual round number.
        
        In CS2 demos, total_rounds_played during a round equals (round - 1).
        So total_rounds_played=0 means Round 1, etc.
        """
        trp = event.get("total_rounds_played", 0)
        return int(trp) + 1

    def detect_multi_kills(self) -> List[HighlightResult]:
        """Detect 3K, 4K, 5K/ACE highlights."""
        highlights = []

        # Group deaths by (round, attacker_steamid)
        kill_groups: Dict[Tuple[int, str], List[Dict[str, Any]]] = {}
        for death in self.deaths:
            if self._is_warmup(death):
                continue
            if not self._is_valid_kill(death):
                continue

            round_num = self._get_round_number(death)
            attacker_steamid = death.get("attacker_steamid")
            if not attacker_steamid:
                continue

            key = (round_num, str(attacker_steamid))
            kill_groups.setdefault(key, []).append(death)

        for (round_num, attacker_steamid), kills in kill_groups.items():
            kill_count = len(kills)
            if kill_count < 3:
                continue

            # Determine type
            if kill_count >= 5:
                hl_type = "ACE"
                score = 1.0
            elif kill_count == 4:
                hl_type = "4K"
                score = 0.85
            else:
                hl_type = "3K"
                score = 0.7

            # Bonus for headshots
            headshots = sum(1 for k in kills if k.get("headshot") is True)
            if headshots >= kill_count // 2 + 1:
                score += 0.05

            # Bonus for difficult weapons (AWP, Deagle, etc.)
            weapons = set(k.get("weapon", "") for k in kills)
            difficult_weapons = {"awp", "deagle", "ssg08", "scar20", "g3sg1", "knife", "hegrenade"}
            if any(w.lower() in difficult_weapons for w in weapons):
                score += 0.03

            # Cap score at 1.0
            score = min(1.0, round(score, 3))

            # Sort kills by tick
            kills_sorted = sorted(kills, key=lambda k: k.get("tick", 0))
            kill_ticks = [int(k.get("tick", 0)) for k in kills_sorted]
            # Per-kill victim details for POV replay segments
            kill_details: List[KillDetail] = []
            for k in kills_sorted:
                kill_details.append(KillDetail(
                    tick=int(k.get("tick", 0)),
                    victim_name=str(k.get("user_name", "")),
                    victim_steamid=str(k.get("user_steamid", "0")),
                    victim_userid=int(k.get("user_user_id", 0)),
                    weapon=str(k.get("weapon", "")),
                    headshot=bool(k.get("headshot", False)),
                ))
            tick_start = int(kills_sorted[0].get("tick", 0))
            tick_end = int(kills_sorted[-1].get("tick", 0))

            # Add padding for recording (5 seconds before first kill, 3 seconds after last)
            padding_start = 5 * self.tick_rate
            padding_end = 3 * self.tick_rate
            tick_start = max(0, tick_start - padding_start)
            tick_end = tick_end + padding_end

            attacker_name = kills_sorted[0].get("attacker_name", "Unknown")
            attacker_userid = int(kills_sorted[0].get("attacker_user_id", 0))
            spec_slot = self._get_spec_slot(attacker_name, attacker_userid)

            highlights.append(
                HighlightResult(
                    type=hl_type,
                    player_name=str(attacker_name),
                    player_steamid=str(attacker_steamid),
                    player_userid=spec_slot,
                    round=round_num,
                    tick_start=tick_start,
                    tick_end=tick_end,
                    kill_count=kill_count,
                    weapons=list(weapons),
                    score=score,
                    kill_ticks=kill_ticks,
                    kill_details=kill_details,
                )
            )

        return highlights

    def detect_clutches(self) -> List[HighlightResult]:
        """Detect clutch wins (1vX where X >= 2).

        A clutch is defined as: winner team has exactly 1 survivor,
        and at least 2 enemies were alive at some point during the clutch.
        The 1vX number reflects enemies alive at round end (capped 2-5).
        """
        highlights = []

        # Build round → deaths mapping
        # Note: player_death total_rounds_played = round - 1, so actual round = trp + 1
        round_deaths: Dict[int, List[Dict[str, Any]]] = {}
        for death in self.deaths:
            if self._is_warmup(death):
                continue
            if not self._is_valid_kill(death):
                continue
            round_num = self._get_round_number(death)
            if round_num <= 1:  # Skip warmup (trp=0 → round=1, but warmup is mixed in)
                continue
            round_deaths.setdefault(round_num, []).append(death)

        # For each round, count deaths per team
        for round_num, deaths in round_deaths.items():
            # round_end total_rounds_played equals the actual round number
            winner = self._get_round_winner(round_num)
            if not winner:
                continue

            # Normalize winner to CT/TERRORIST
            winner_team = "CT" if winner == "CT" else "TERRORIST"
            loser_team = "TERRORIST" if winner_team == "CT" else "CT"

            # Count deaths and track players for each team
            winner_deaths = 0
            loser_deaths = 0
            dead_winner_players: Set[str] = set()
            all_winner_players: Set[str] = set()
            all_loser_players: Set[str] = set()

            for death in deaths:
                # Winner team
                if death.get("attacker_team_name") == winner_team:
                    sid = str(death.get("attacker_steamid", ""))
                    if sid:
                        all_winner_players.add(sid)
                if death.get("user_team_name") == winner_team:
                    sid = str(death.get("user_steamid", ""))
                    if sid:
                        all_winner_players.add(sid)
                    winner_deaths += 1
                    dead_winner_players.add(sid)

                # Loser team
                if death.get("attacker_team_name") == loser_team:
                    sid = str(death.get("attacker_steamid", ""))
                    if sid:
                        all_loser_players.add(sid)
                if death.get("user_team_name") == loser_team:
                    sid = str(death.get("user_steamid", ""))
                    if sid:
                        all_loser_players.add(sid)
                    loser_deaths += 1

            team_size = len(all_winner_players)
            enemy_team_size = len(all_loser_players)

            if team_size < 2:
                continue

            # Clutch: winner team has exactly 1 survivor
            survivor_count = team_size - winner_deaths
            if survivor_count != 1:
                continue

            # Determine clutch type based on enemies faced
            # X = enemies alive at round end, minimum 2 for a highlight-worthy clutch
            enemy_survivors = enemy_team_size - loser_deaths
            x = max(1, enemy_survivors)
            # If all enemies are dead, estimate based on team sizes
            if x < 2:
                x = max(2, min(5, team_size - 1))

            x = min(5, x)

            if x == 5:
                hl_type = "CLUTCH_1V5"
                score = 1.0
            elif x == 4:
                hl_type = "CLUTCH_1V4"
                score = 0.9
            elif x == 3:
                hl_type = "CLUTCH_1V3"
                score = 0.8
            else:
                hl_type = "CLUTCH_1V2"
                score = 0.7

            # Find the survivor (clutch player)
            survivor_steamid = list(all_winner_players - dead_winner_players)
            if not survivor_steamid:
                continue
            clutch_steamid = survivor_steamid[0]

            # Find survivor name and userid from deaths
            clutch_name = "Unknown"
            clutch_userid = 0
            for death in deaths:
                if str(death.get("attacker_steamid", "")) == clutch_steamid:
                    clutch_name = death.get("attacker_name", "Unknown")
                    clutch_userid = int(death.get("attacker_user_id", 0))
                    break
                if str(death.get("user_steamid", "")) == clutch_steamid:
                    clutch_name = death.get("user_name", "Unknown")
                    clutch_userid = int(death.get("user_user_id", 0))
                    break

            spec_slot = self._get_spec_slot(clutch_name, clutch_userid)

            # Count actual kills by clutch player in this round, and collect kill ticks
            clutch_kills = 0
            clutch_kill_ticks: List[int] = []
            for d in deaths:
                if str(d.get("attacker_steamid", "")) == clutch_steamid:
                    clutch_kills += 1
                    t = d.get("tick")
                    if t is not None:
                        clutch_kill_ticks.append(int(t))

            # Get tick range for the round
            round_start_tick = min(d.get("tick", 0) for d in deaths)
            round_end_tick = self._get_round_end_tick(round_num)
            if round_end_tick is None:
                round_end_tick = max(d.get("tick", 0) for d in deaths)

            # Padding for recording
            padding_start = 8 * self.tick_rate  # More padding for clutch context
            padding_end = 5 * self.tick_rate
            tick_start = max(0, int(round_start_tick) - padding_start)
            tick_end = int(round_end_tick) + padding_end

            highlights.append(
                HighlightResult(
                    type=hl_type,
                    player_name=clutch_name,
                    player_steamid=str(clutch_steamid),
                    player_userid=spec_slot,
                    round=round_num,
                    tick_start=tick_start,
                    tick_end=tick_end,
                    kill_count=clutch_kills,
                    weapons=[],
                    score=round(score, 3),
                    kill_ticks=sorted(clutch_kill_ticks) if clutch_kill_ticks else None,
                )
            )

        return highlights

    def detect_eco_wins(self) -> List[HighlightResult]:
        """
        Detect eco round wins.
        Simplified heuristic: if winner team won with very few kills (indicating
        a bomb plant/defuse win rather than gunfights), it might be an eco win.
        
        A more accurate implementation would require parse_ticks data for equipment values.
        This is a best-effort detection for Phase 1.
        """
        highlights = []

        round_deaths: Dict[int, List[Dict[str, Any]]] = {}
        for death in self.deaths:
            if self._is_warmup(death):
                continue
            if not self._is_valid_kill(death):
                continue
            round_num = self._get_round_number(death)
            if round_num <= 1:
                continue
            round_deaths.setdefault(round_num, []).append(death)

        for round_num, deaths in round_deaths.items():
            winner = self._get_round_winner(round_num)
            if not winner:
                continue

            winner_team = "CT" if winner == "CT" else "TERRORIST"
            loser_team = "TERRORIST" if winner_team == "CT" else "CT"

            # Count winner team kills (kills made by winner team)
            winner_kills = sum(
                1 for d in deaths
                if d.get("attacker_team_name") == winner_team
            )

            # Heuristic: eco rounds often result in:
            # - Winner team has very few kills (0-1, indicating they won by bomb/defuse)
            # - Loser team had heavy casualties (4+ deaths, indicating superior firepower)
            # - Winner team also suffered casualties (at least 3 deaths, indicating outgunned)
            # This is a weak heuristic; accurate eco detection needs equipment data
            loser_deaths = sum(
                1 for d in deaths
                if d.get("user_team_name") == loser_team
            )
            winner_deaths = sum(
                1 for d in deaths
                if d.get("user_team_name") == winner_team
            )
            if winner_kills <= 1 and loser_deaths >= 4 and winner_deaths >= 3:
                # Find a representative player from winner team (last killer or first survivor)
                rep_death = None
                for d in reversed(deaths):
                    if d.get("attacker_team_name") == winner_team:
                        rep_death = d
                        break

                if rep_death is None:
                    # No kills by winner team — use first victim from winner team as representative
                    for d in deaths:
                        if d.get("user_team_name") == winner_team:
                            rep_death = d
                            break

                if rep_death is None:
                    continue

                player_name = rep_death.get("attacker_name") or rep_death.get("user_name", "Unknown")
                player_steamid = rep_death.get("attacker_steamid") or rep_death.get("user_steamid", 0)
                fallback_uid = int(rep_death.get("attacker_user_id") or rep_death.get("user_user_id", 0))
                player_userid = self._get_spec_slot(player_name, fallback_uid)

                round_start_tick = min(d.get("tick", 0) for d in deaths)
                round_end_tick = self._get_round_end_tick(round_num)
                if round_end_tick is None:
                    round_end_tick = max(d.get("tick", 0) for d in deaths)

                highlights.append(
                    HighlightResult(
                        type="ECO_WIN",
                        player_name=str(player_name),
                        player_steamid=str(player_steamid) if player_steamid else "0",
                        player_userid=int(player_userid) if player_userid else 0,
                        round=round_num,
                        tick_start=max(0, int(round_start_tick) - 5 * self.tick_rate),
                        tick_end=int(round_end_tick) + 5 * self.tick_rate,
                        kill_count=winner_kills,
                        weapons=[],
                        score=0.6,
                    )
                )

        return highlights
