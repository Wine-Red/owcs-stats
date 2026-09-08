"""Validate the public contract, examples and optional recorded HTTP responses.

Install requirements-validation.txt, then run python validate.py from any cwd.
Never opens a database or a network connection. HTTP captures come from tests
or the read-only verification script, not from this validator itself.
"""
import copy
import argparse
import json
import re
from collections import Counter
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import validate
from referencing import Registry, Resource

BASE = Path(__file__).resolve().parent
SPEC = yaml.safe_load((BASE / "openapi.yaml").read_text(encoding="utf-8"))
URI = "urn:owcs:public-data-api"
resource = Resource.from_contents({
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": URI,
    "components": SPEC["components"],
})
registry = Registry().with_resource(URI, resource)


def schema_validator(name):
    return Draft202012Validator(
        {"$ref": f"{URI}#/components/schemas/{name}"},
        registry=registry,
        format_checker=FormatChecker(),
    )


def expect_invalid(name, data):
    assert not schema_validator(name).is_valid(data), f"Unexpected valid {name}: {data}"


def resolve(value):
    if "$ref" not in value:
        return value
    assert value["$ref"].startswith("#/"), "Contract must be self-contained"
    node = SPEC
    for part in value["$ref"][2:].split("/"):
        node = node[part.replace("~1", "/").replace("~0", "~")]
    return node


def walk(value):
    yield value
    if isinstance(value, dict):
        for item in value.values():
            yield from walk(item)
    elif isinstance(value, list):
        for item in value:
            yield from walk(item)


def validate_contract():
    validate(SPEC)
    assert SPEC["openapi"] == "3.1.1"
    assert SPEC["info"]["version"] == "1.0.0"
    assert SPEC["security"] == []
    assert SPEC["servers"][0]["url"] == "/data/v1"
    assert len(SPEC["paths"]) == 21
    operations = set()
    for path, methods in SPEC["paths"].items():
        assert set(methods) == {"get", "head"}, path
        for method, operation in methods.items():
            assert operation["operationId"] not in operations
            operations.add(operation["operationId"])
            params = [resolve(p) for p in operation["parameters"]]
            pairs = [(p["name"], p["in"]) for p in params]
            assert len(pairs) == len(set(pairs)), (path, pairs)
            names = {p["name"] for p in params if p["in"] == "path" and p.get("required")}
            assert names == set(re.findall(r"\{([^}]+)\}", path)), path
            assert "304" in operation["responses"]
            assert "405" in operation["responses"]
            assert "content" not in resolve(operation["responses"]["304"])
            if method == "head":
                assert all("content" not in resolve(r) for r in operation["responses"].values())
    forbidden = {
        "externalId", "external_id", "external_event_name", "externalEventName",
        "sourceId", "source_id", "sourceTaskId", "source_task_id", "sourcePage", "source_page",
        "sourceGroup", "source_group", "pairKey", "pair_key", "sourceType", "source_type",
        "sourceKey", "source_key", "sourceUpdatedAt", "syncedAt", "synced_at",
        "statsVersion", "stats_version", "externalRoundIndex", "external_round_index",
        "createdAt", "created_at", "updatedAt", "updated_at", "data_updated_at",
        "identityOrigin", "identity_origin", "orphanedAt", "orphaned_at",
        "player_stat_id", "playerStatId", "player_hero_stat_id", "seasonTeamId", "season_team_id",
        "normalizedAlias", "normalized_alias", "joinDate", "leaveDate", "join_date", "leave_date",
        "tokenHash", "token_hash", "voterHash", "voter_hash", "poll_id", "attempts", "lastError",
        "digest", "payload", "config", "configs", "region", "logo", "image", "cached",
    }
    for name, schema in SPEC["components"]["schemas"].items():
        Draft202012Validator.check_schema(schema)
        for node in walk(schema):
            if not isinstance(node, dict):
                continue
            if "properties" in node:
                assert not forbidden.intersection(node["properties"]), (name, node)
            if node.get("type") == "object":
                assert node.get("additionalProperties") is False, name
                assert set(node.get("required", [])) == set(node.get("properties", {})), name
    for node in walk(SPEC):
        if isinstance(node, dict) and "$ref" in node:
            resolve(node)
    return len(operations)


def validate_examples():
    manifest = json.loads((BASE / "examples/manifest.json").read_text(encoding="utf-8"))
    examples = {}
    for file, entry in manifest.items():
        data = json.loads((BASE / file).read_text(encoding="utf-8"))
        schema_validator(entry["schema"]).validate(data)
        examples[Path(file).stem] = data
    for methods in SPEC["paths"].values():
        media = methods["get"]["responses"]["200"]["content"]["application/json"]
        if "example" in media:
            name = media["schema"]["$ref"].rsplit("/", 1)[-1]
            schema_validator(name).validate(media["example"])
    return examples


def validate_sample_relations(examples):
    match = examples["match"]["data"]
    game = examples["game"]["data"]
    bundle = examples["match-data"]["data"]
    assert bundle["match"] == match
    assert bundle["games"][0]["game"] == game
    assert bundle["games"][0]["player_stats"] == examples["player-stats"]["data"]
    assert match["id"] == 5445 and game["id"] == 27301
    assert game["duration_seconds"] == 599
    assert match["team1"]["score"] == 3 and match["team2"]["score"] == 2
    match_teams = {match[side]["team"]["id"] for side in ("team1", "team2")}
    assert match["winner_team_id"] in match_teams
    all_keys, game_ids, numbers = set(), set(), set()
    win_counts = Counter()
    for entry in bundle["games"]:
        current, stats = entry["game"], entry["player_stats"]
        assert current["id"] not in game_ids
        game_ids.add(current["id"])
        assert current["match_id"] == match["id"]
        assert {current[side]["team"]["id"] for side in ("team1", "team2")} == match_teams
        assert current["winner_team_id"] in match_teams
        win_counts[current["winner_team_id"]] += 1
        if current["number"] is not None:
            assert current["number"] not in numbers
            numbers.add(current["number"])
        counts, players = Counter(), set()
        for row in stats:
            key = (row["game_id"], row["team"]["id"], row["player"]["id"])
            assert key not in all_keys
            all_keys.add(key)
            assert row["game_id"] == current["id"] and row["team"]["id"] in match_teams
            assert row["player"]["id"] not in players
            players.add(row["player"]["id"])
            counts[row["team"]["id"]] += 1
            assert row["metrics"]["final_blows"] is None
            assert row["metrics"]["ultimates_used"] is None
            assert row["hero_stats"] == {"status": "not_recorded", "items": []}
        assert current["player_stats_coverage"]["recorded_players"] == len(stats)
        assert counts == Counter({team_id: 5 for team_id in match_teams})
    assert len(game_ids) == 5 and len(all_keys) == 50
    # Preserve the independently observed discrepancy, rather than changing
    # the source facts to make a fixture look consistent.
    assert win_counts == Counter({53: 4, 65: 1})
    assert bundle["result_consistency"] == "conflicting"


def validate_negative_cases(examples):
    cases = 0
    for value in (0, -1, "599"):
        data = copy.deepcopy(examples["game"])
        data["data"]["duration_seconds"] = value
        expect_invalid("GameResponse", data)
        cases += 1
    for field in ("source_task_id", "updated_at", "player_stat_id", "token_hash"):
        data = copy.deepcopy(examples["player-stats"])
        data["data"][0][field] = "must-not-leak"
        expect_invalid("PlayerGameStatsList", data)
        cases += 1
    data = copy.deepcopy(examples["player-stats"])
    data["data"][0]["hero_stats"] = {"status": "recorded", "items": []}
    expect_invalid("PlayerGameStatsList", data)
    cases += 1
    data = copy.deepcopy(examples["player-stats"])
    data["data"][0]["metrics"]["damage"] = -1
    expect_invalid("PlayerGameStatsList", data)
    cases += 1
    data = copy.deepcopy(examples["game"])
    data["data"]["map"]["mode"] = "payload"
    expect_invalid("GameResponse", data)
    cases += 1
    return cases


def validate_links():
    count = 0
    for file in BASE.rglob("*.md"):
        for link in re.findall(r"\[[^\]]*\]\(([^)]+)\)", file.read_text(encoding="utf-8")):
            if link.startswith(("https://", "http://", "#")):
                continue
            target = link.split("#", 1)[0]
            assert (file.parent / target).exists(), (file, link)
            count += 1
    return count


def validate_http_responses(file, require_all=True):
    responses = json.loads(Path(file).read_text(encoding="utf-8"))
    assert responses, "Response capture must not be empty"
    seen = set()
    for response in responses:
        candidates = [p for p in SPEC["paths"] if re.fullmatch(re.sub(r"\{[^}]+\}", r"[^/]+", p), response["path"])]
        assert len(candidates) == 1, response["path"]
        path, method = candidates[0], response["method"]
        operation = SPEC["paths"][path][method]
        definition = resolve(operation["responses"][str(response["status"])])
        assert response["headers"].get("x-request-id"), response["path"]
        if method == "head" or response["status"] == 304:
            assert response["body"] is None, response["path"]
        else:
            schema = definition["content"]["application/json"]["schema"]
            schema_validator(schema["$ref"].split("/")[-1]).validate(response["body"])
        if response["status"] in (200, 304):
            assert response["headers"].get("etag"), response["path"]
            assert response["headers"]["cache-control"] == "public, max-age=0, must-revalidate"
        else:
            assert response["headers"]["cache-control"] == "no-store"
        if response["status"] == 200:
            seen.add((path, method))
    expected = {(path, method) for path in SPEC["paths"] for method in ("get", "head")}
    if require_all:
        assert seen == expected, f"Missing successful HTTP operations: {expected - seen}"
    return len(responses), sorted(f"{method.upper()} {path}" for path, method in expected - seen)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--responses", help="JSON HTTP captures produced by integration tests")
    parser.add_argument("--allow-partial", action="store_true", help="Validate captured operations without requiring all 42; reports omissions")
    args = parser.parse_args()
    operations = validate_contract()
    examples = validate_examples()
    validate_sample_relations(examples)
    negatives = validate_negative_cases(examples)
    links = validate_links()
    responses, missing = validate_http_responses(args.responses, not args.allow_partial) if args.responses else (0, [])
    print(json.dumps({
        "openapi": SPEC["openapi"], "paths": len(SPEC["paths"]), "operations": operations,
        "schemas": len(SPEC["components"]["schemas"]), "valid_examples": len(examples),
        "rejected_negative_cases": negatives, "sample_games": 5, "sample_player_rows": 50,
        "local_markdown_links": links, "http_responses": responses, "result": "passed",
        "missing_http_operations": missing,
        "scope": "contract and recorded HTTP responses" if responses else "contract documents and examples",
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
