#!/usr/bin/env python3
"""Fetch Garmin Connect data using garth library.

Usage:
    python sync.py <token_dir> <days> <command>

Commands:
    activities  - Fetch activities list (default)
    profile     - Fetch user social profile

Outputs JSON to stdout. Progress messages go to stderr.
"""

import sys
import json
import tempfile
import os
from datetime import datetime, timedelta

try:
    import garth
except ImportError:
    print("garth not installed. Run: pip install garth", file=sys.stderr)
    sys.exit(1)


def main():
    token_dir = sys.argv[1] if len(sys.argv) > 1 else "/mnt/project"
    days = int(sys.argv[2]) if len(sys.argv) > 2 else 730
    command = sys.argv[3] if len(sys.argv) > 3 else "activities"

    oauth1_path = os.path.join(token_dir, "oauth1_token.json")
    oauth2_path = os.path.join(token_dir, "oauth2_token.json")

    if not os.path.exists(oauth1_path) or not os.path.exists(oauth2_path):
        print(
            f"Token files not found in {token_dir}. Expected oauth1_token.json and oauth2_token.json.",
            file=sys.stderr,
        )
        sys.exit(1)

    tmpdir = tempfile.mkdtemp()
    with open(f"{tmpdir}/oauth1_token.json", "w") as f:
        json.dump(json.load(open(oauth1_path)), f)
    with open(f"{tmpdir}/oauth2_token.json", "w") as f:
        json.dump(json.load(open(oauth2_path)), f)

    garth.resume(tmpdir)

    if command == "profile":
        try:
            profile = garth.connectapi("/userprofile-service/socialProfile")
            print(json.dumps(profile))
        except Exception as e:
            print(f"Failed to fetch profile: {e}", file=sys.stderr)
            sys.exit(1)
        return

    # Fetch activities
    after_date = datetime.now() - timedelta(days=days)

    activities = []
    start = 0
    limit = 100

    while True:
        try:
            batch = garth.connectapi(
                "/activitylist-service/activities/search/activities",
                params={
                    "limit": limit,
                    "start": start,
                    "startDate": after_date.strftime("%Y-%m-%d"),
                    "sortField": "startLocal",
                    "sortOrder": "desc",
                },
            )
        except Exception as e:
            print(f"Failed to fetch activities: {e}", file=sys.stderr)
            sys.exit(1)

        if not batch:
            break

        activities.extend(batch)
        sys.stderr.write(f"   Fetched {len(activities)} activities...\n")
        sys.stderr.flush()

        if len(batch) < limit:
            break

        start += limit

    print(json.dumps(activities))


if __name__ == "__main__":
    main()
