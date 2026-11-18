"""Validate raw measurements and print report rows. Run after run.sh bench."""
import gzip
import json
import math
from pathlib import Path

results = Path(__file__).resolve().parent / "results"
for rooms in (32, 16, 8):
    for mode in (0, 1, 3):
        name = f"{rooms}-{mode}"
        log = (results / f"{name}.log").read_text()
        record, = [json.loads(line[7:]) for line in log.splitlines() if line.startswith("RESULT ")]
        assert record["rooms"] == rooms and record["mode"] == mode
        assert record["seconds"] >= 60 and "POC_PASS" in log
        traces = {}
        with gzip.open(results / f"{name}.trace.gz", "rt") as stream:
            for line in stream:
                prefix, metric, samples = line.split()
                assert prefix == "TRACE" and metric.endswith("_ns")
                metric = metric[:-3]
                samples = sorted(int(ns) / 1e6 for ns in samples.split(","))
                traces[metric] = len(samples)
                for quantile in (95, 99):
                    index = math.ceil(len(samples) * quantile / 100) - 1
                    assert abs(samples[index] - record[f"{metric}{quantile}"]) < .000001
        assert traces["round"] == traces["lag"] and traces["physics"] > traces["round"]
        print("| {rooms} | {mode} | {cpu:.2f} | {hotThreadCPU:.2f} | "
              "{physics95:.3f} / {physics99:.3f} | {round95:.2f} / {round99:.2f} | "
              "{lag95:.0f} / {lag99:.0f} | {miss} / {catch} | "
              "{peak:.1f} / {post:.1f} |".format(
                  **record, peak=record["peakKiB"] / 1024, post=record["postKiB"] / 1024))
