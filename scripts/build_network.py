#!/usr/bin/env python3
"""Build a compact metro/RER network JSON from the local GTFS files."""

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_GTFS_DIR = PROJECT_ROOT / "data/raw/gtfs-idfm-2024"
DEFAULT_OUTPUT = PROJECT_ROOT / "public/data/network.json"
METRO_TYPE = "1"
RAIL_TYPE = "2"
RER_AGENCY = "IDFM:71"
FALLBACK_TRANSFER_SECONDS = 180


def parse_time(value: str) -> int:
    # GTFS allows hours greater than 23, for example 25:10:00 means 01:10
    # on the next service day. Keeping seconds since service-day start avoids
    # splitting trips at midnight.
    hours, minutes, seconds = (int(part) for part in value.split(":"))
    return hours * 3600 + minutes * 60 + seconds


def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y%m%d").date()


def read_csv(path: Path):
    with path.open(newline="", encoding="utf-8-sig") as handle:
        yield from csv.DictReader(handle)


def route_sort_key(route: dict) -> tuple[int, int, str]:
    name = route["shortName"]
    if route["mode"] == "metro":
        numeric = int(name[:-1]) if name.endswith("B") else int(name)
        branch = 1 if name.endswith("B") else 0
        return (0, numeric, str(branch))
    return (1, 0, name)


def build_service_masks(gtfs_dir: Path, needed_service_ids: set[str]) -> tuple[list[str], dict[str, int]]:
    # Store active service dates as a compact bit mask. The browser can then
    # test whether a trip runs on a date without loading calendar tables.
    calendars: dict[str, dict] = {}
    exception_rows: list[dict] = []
    all_dates: list[date] = []

    for row in read_csv(gtfs_dir / "calendar.txt"):
        if row["service_id"] not in needed_service_ids:
            continue
        start = parse_date(row["start_date"])
        end = parse_date(row["end_date"])
        calendars[row["service_id"]] = row
        all_dates.extend([start, end])

    for row in read_csv(gtfs_dir / "calendar_dates.txt"):
        if row["service_id"] not in needed_service_ids:
            continue
        exception_rows.append(row)
        all_dates.append(parse_date(row["date"]))

    if not all_dates:
        raise RuntimeError("No service dates found for selected routes.")

    start = min(all_dates)
    end = max(all_dates)
    dates: list[date] = []
    cursor = start
    while cursor <= end:
        dates.append(cursor)
        cursor += timedelta(days=1)

    date_index = {day: index for index, day in enumerate(dates)}
    active_by_service: dict[str, set[int]] = {service_id: set() for service_id in needed_service_ids}
    weekday_columns = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

    for service_id, row in calendars.items():
        start_date = parse_date(row["start_date"])
        end_date = parse_date(row["end_date"])
        cursor = start_date
        while cursor <= end_date:
            if row[weekday_columns[cursor.weekday()]] == "1":
                active_by_service[service_id].add(date_index[cursor])
            cursor += timedelta(days=1)

    for row in exception_rows:
        service_id = row["service_id"]
        index = date_index[parse_date(row["date"])]
        if row["exception_type"] == "1":
            active_by_service.setdefault(service_id, set()).add(index)
        elif row["exception_type"] == "2":
            active_by_service.setdefault(service_id, set()).discard(index)

    masks: dict[str, int] = {}
    for service_id, indexes in active_by_service.items():
        mask = 0
        for index in indexes:
            mask |= 1 << index
        masks[service_id] = mask

    return ([day.isoformat() for day in dates], masks)


def load_stops(gtfs_dir: Path) -> dict[str, dict]:
    stops: dict[str, dict] = {}
    for row in read_csv(gtfs_dir / "stops.txt"):
        try:
            lon = float(row["stop_lon"])
            lat = float(row["stop_lat"])
        except ValueError:
            lon = lat = 0.0
        stops[row["stop_id"]] = {
            "id": row["stop_id"],
            "name": row["stop_name"],
            "lon": lon,
            "lat": lat,
            "parent": row["parent_station"],
            "locationType": row["location_type"] or "0",
            "wheelchair": row["wheelchair_boarding"] or "0",
            "platform": row["platform_code"],
        }
    return stops


def station_id_for(stop_id: str, stops: dict[str, dict]) -> str:
    stop = stops[stop_id]
    return stop["parent"] if stop["parent"] and stop["parent"] in stops else stop_id


def build_network(gtfs_dir: Path) -> dict:
    # Keep only the transport modes requested by the project: metro and RER.
    # Other trains, buses and trams remain out of the generated runtime graph.
    routes = []
    route_by_id: dict[str, dict] = {}
    for row in read_csv(gtfs_dir / "routes.txt"):
        is_metro = row["route_type"] == METRO_TYPE
        is_rer = row["route_type"] == RAIL_TYPE and row["agency_id"] == RER_AGENCY
        if not is_metro and not is_rer:
            continue
        route = {
            "id": row["route_id"],
            "shortName": row["route_short_name"],
            "longName": row["route_long_name"],
            "mode": "metro" if is_metro else "rer",
            "color": f"#{row['route_color'] or '777777'}",
            "textColor": f"#{row['route_text_color'] or 'ffffff'}",
        }
        route_by_id[row["route_id"]] = route
        routes.append(route)

    routes.sort(key=route_sort_key)
    route_index_by_id = {route["id"]: index for index, route in enumerate(routes)}

    trips: dict[str, dict] = {}
    service_ids: set[str] = set()
    headsigns: list[str] = []
    headsign_index: dict[str, int] = {}
    for row in read_csv(gtfs_dir / "trips.txt"):
        route_id = row["route_id"]
        if route_id not in route_index_by_id:
            continue
        headsign = row["trip_headsign"] or ""
        if headsign not in headsign_index:
            headsign_index[headsign] = len(headsigns)
            headsigns.append(headsign)
        trips[row["trip_id"]] = {
            "route": route_index_by_id[route_id],
            "service": row["service_id"],
            "headsign": headsign_index[headsign],
        }
        service_ids.add(row["service_id"])

    dates, service_masks_by_id = build_service_masks(gtfs_dir, service_ids)
    service_list = sorted(service_ids)
    service_index_by_id = {service_id: index for index, service_id in enumerate(service_list)}
    services = [service_masks_by_id[service_id] for service_id in service_list]

    stops = load_stops(gtfs_dir)
    used_stops: set[str] = set()
    stop_routes: dict[str, set[int]] = defaultdict(set)
    connection_groups: dict[tuple[str, str, int, int], list[list[int]]] = defaultdict(list)
    previous_by_trip: dict[str, dict] = {}

    for row in read_csv(gtfs_dir / "stop_times.txt"):
        trip = trips.get(row["trip_id"])
        if trip is None:
            continue
        stop_id = row["stop_id"]
        if stop_id not in stops:
            previous_by_trip.pop(row["trip_id"], None)
            continue
        arrival = parse_time(row["arrival_time"])
        departure = parse_time(row["departure_time"])
        service_index = service_index_by_id[trip["service"]]
        route_index = trip["route"]
        headsign_index_value = trip["headsign"]
        used_stops.add(stop_id)
        stop_routes[stop_id].add(route_index)

        previous = previous_by_trip.get(row["trip_id"])
        if previous is not None and arrival >= previous["departure"]:
            key = (previous["stop"], stop_id, route_index, headsign_index_value)
            connection_groups[key].append([service_index, previous["departure"], arrival])
        previous_by_trip[row["trip_id"]] = {
            "stop": stop_id,
            "departure": departure,
        }

    station_to_stop_ids: dict[str, list[str]] = defaultdict(list)
    station_routes: dict[str, set[int]] = defaultdict(set)
    for stop_id in sorted(used_stops):
        commercial_station_id = station_id_for(stop_id, stops)
        station_to_stop_ids[commercial_station_id].append(stop_id)
        station_routes[commercial_station_id].update(stop_routes[stop_id])

    station_ids = sorted(station_to_stop_ids, key=lambda sid: stops[sid]["name"] if sid in stops else sid)
    station_index_by_id = {station_id: index for index, station_id in enumerate(station_ids)}
    stop_ids = sorted(used_stops, key=lambda stop_id: (stops[station_id_for(stop_id, stops)]["name"], stops[stop_id]["name"], stop_id))
    stop_index_by_id = {stop_id: index for index, stop_id in enumerate(stop_ids)}

    stations = []
    for station_id in station_ids:
        source = stops.get(station_id)
        child_ids = station_to_stop_ids[station_id]
        if source is None:
            lat = sum(stops[stop_id]["lat"] for stop_id in child_ids) / len(child_ids)
            lon = sum(stops[stop_id]["lon"] for stop_id in child_ids) / len(child_ids)
            name = stops[child_ids[0]]["name"]
        else:
            lat = source["lat"] or sum(stops[stop_id]["lat"] for stop_id in child_ids) / len(child_ids)
            lon = source["lon"] or sum(stops[stop_id]["lon"] for stop_id in child_ids) / len(child_ids)
            name = source["name"]
        stations.append({
            "id": station_id,
            "name": name,
            "lat": round(lat, 8),
            "lon": round(lon, 8),
            "stops": [stop_index_by_id[stop_id] for stop_id in child_ids],
            "routes": sorted(station_routes[station_id]),
        })

    stop_items = []
    for stop_id in stop_ids:
        stop = stops[stop_id]
        commercial_station_id = station_id_for(stop_id, stops)
        stop_items.append({
            "id": stop_id,
            "name": stop["name"],
            "station": station_index_by_id[commercial_station_id],
            "lat": round(stop["lat"], 8),
            "lon": round(stop["lon"], 8),
            "routes": sorted(stop_routes[stop_id]),
            "platform": stop["platform"],
            "wheelchair": stop["wheelchair"],
        })

    edges = []
    station_edge_best: dict[tuple[int, int, int], int] = {}
    for (from_stop, to_stop, route_index, headsign_index_value), schedules in connection_groups.items():
        if from_stop not in stop_index_by_id or to_stop not in stop_index_by_id:
            continue
        schedules.sort(key=lambda item: (item[1], item[0], item[2]))
        from_stop_index = stop_index_by_id[from_stop]
        to_stop_index = stop_index_by_id[to_stop]
        edges.append([
            from_stop_index,
            to_stop_index,
            route_index,
            headsign_index_value,
            schedules,
        ])

        from_station = stop_items[from_stop_index]["station"]
        to_station = stop_items[to_stop_index]["station"]
        if from_station == to_station:
            continue
        weight = min(max(1, item[2] - item[1]) for item in schedules)
        key = (min(from_station, to_station), max(from_station, to_station), route_index)
        station_edge_best[key] = min(station_edge_best.get(key, weight), weight)

    transfer_best: dict[tuple[int, int], int] = {}
    for row in read_csv(gtfs_dir / "transfers.txt"):
        from_stop = row["from_stop_id"]
        to_stop = row["to_stop_id"]
        if from_stop not in stop_index_by_id or to_stop not in stop_index_by_id:
            continue
        try:
            seconds = int(row["min_transfer_time"] or "0")
        except ValueError:
            seconds = 0
        if seconds <= 0:
            seconds = FALLBACK_TRANSFER_SECONDS
        key = (stop_index_by_id[from_stop], stop_index_by_id[to_stop])
        transfer_best[key] = min(transfer_best.get(key, seconds), seconds)

    for station in stations:
        station_stop_indexes = station["stops"]
        for from_stop_index in station_stop_indexes:
            for to_stop_index in station_stop_indexes:
                if from_stop_index == to_stop_index:
                    continue
                key = (from_stop_index, to_stop_index)
                transfer_best[key] = min(transfer_best.get(key, FALLBACK_TRANSFER_SECONDS), FALLBACK_TRANSFER_SECONDS)

    station_edges = [
        [from_station, to_station, route_index, weight]
        for (from_station, to_station, route_index), weight in station_edge_best.items()
    ]
    station_edges.sort(key=lambda edge: (edge[2], edge[0], edge[1], edge[3]))

    transfers = [
        [from_stop_index, to_stop_index, seconds]
        for (from_stop_index, to_stop_index), seconds in sorted(transfer_best.items())
    ]

    try:
        source_label = str(gtfs_dir.resolve().relative_to(PROJECT_ROOT))
    except ValueError:
        source_label = str(gtfs_dir)

    return {
        "generatedAt": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "source": source_label,
        "fallbackTransferSeconds": FALLBACK_TRANSFER_SECONDS,
        "dates": dates,
        "routes": routes,
        "services": services,
        "headsigns": headsigns,
        "stations": stations,
        "stops": stop_items,
        "edges": edges,
        "transfers": transfers,
        "stationEdges": station_edges,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gtfs-dir", type=Path, default=DEFAULT_GTFS_DIR)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    network = build_network(args.gtfs_dir)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8") as handle:
        json.dump(network, handle, ensure_ascii=False, separators=(",", ":"))

    print(f"Wrote {args.output}")
    print(f"Routes: {len(network['routes'])}")
    print(f"Stations: {len(network['stations'])}")
    print(f"Stops: {len(network['stops'])}")
    print(f"Scheduled edge groups: {len(network['edges'])}")
    print(f"Transfers: {len(network['transfers'])}")


if __name__ == "__main__":
    main()
