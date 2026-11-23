#!/usr/bin/env python3
"""Run isolated Skynet processes in sequence; leave raw stdout and OS samples."""
import argparse
import csv
import json
import math
import os
import platform
import re
import resource
import subprocess
import time
from collections import Counter
from pathlib import Path

os.chdir(Path(__file__).resolve().parent)
CLOCK_TICKS = os.sysconf("SC_CLK_TCK")
PAGE_KIB = os.sysconf("SC_PAGE_SIZE") // 1024

def process_sample(pid):
    stamp = time.monotonic_ns()
    try:
        stats = (Path("/proc") / str(pid) / "stat").read_text().rsplit(")", 1)[1].split()
        return stamp, (int(stats[11])+int(stats[12]))/CLOCK_TICKS, int(stats[21])*PAGE_KIB
    except (FileNotFoundError, ProcessLookupError):
        return None

def quantile(hist, width, count, q):
    if not count:
        return None
    need = math.ceil(count*q)
    ordered = 0
    for bin_id, hits in sorted(hist.items()):
        ordered += hits
        if ordered >= need:
            return bin_id*width
    raise ValueError("histogram population mismatch")

def metadata():
    def capture(fn):
        try:
            return Path(fn).read_text().strip() or None
        except OSError:
            return None
    def version(cmd):
        try:
            return subprocess.check_output(cmd, text=True, stderr=subprocess.STDOUT).splitlines()[0]
        except (OSError, subprocess.CalledProcessError, IndexError):
            return None
    return {"os":platform.platform(),"cpu_model":re.findall(r"^model name\s*:\s*(.+)",capture("/proc/cpuinfo") or "",re.M)[:1],
            "logical_cpus":os.cpu_count(),"affinity_cpus":len(os.sched_getaffinity(0)),
            "meminfo":(capture("/proc/meminfo") or "").splitlines()[:3],
            "cpu_max":capture("/sys/fs/cgroup/cpu.max"),"memory_max":capture("/sys/fs/cgroup/memory.max"),
            "cgroup":capture("/proc/self/cgroup"),"gcc":version([os.environ.get("CC","cc"),"--version"]),
            "lua":version([".build/skynet/3rd/lua/lua","-v"]),"skynet_workers":4}

def measure(kind, rooms, hz, sec, out):
    slug = f"{kind}-{hz}hz-{rooms}"
    path = out/f"{slug}.log"
    env = dict(os.environ,POC_WORLD=kind,POC_HZ=str(hz),POC_ROOMS=str(rooms),POC_SECONDS=str(sec))
    samples = []
    over = False
    with path.open("w") as log:
        proc = subprocess.Popen(["./run.sh","bench"],env=env,stdout=log,stderr=subprocess.STDOUT)
        deadline = time.monotonic()+sec+30
        try:
            while proc.poll() is None:
                sample = process_sample(proc.pid)
                if sample is not None:
                    samples.append(sample)
                if time.monotonic()>deadline:
                    over=True
                    proc.terminate()
                    try:
                        proc.wait(2)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                    proc.wait()
                    break
                time.sleep(0.10)
        finally:
            if proc.poll() is None:
                proc.kill()
                proc.wait()
    with (out/f"{slug}-process.csv").open("w") as f:
        writer=csv.writer(f)
        writer.writerow(("monotonic_ns","cpu_seconds","rss_kib"))
        writer.writerows(samples)
    lines=path.read_text(errors="replace").splitlines()
    row=dict(engine=kind,hz=hz,rooms=rooms,seconds=sec,exit=proc.returncode,
             expected_steps=rooms*hz*sec,log=path.name)
    if over or proc.returncode or "POC_PASS" not in lines or not any(x.startswith("DESTROYED,") for x in lines):
        return row|{"status":"timeout" if over else "failed"}
    try:
        start,end=map(int,next(x for x in lines if x.startswith("BENCH_BEGIN,")).split(",")[-2:])
        room_rows = [x.split(",")[1:] for x in lines if x.startswith("ROOM,")]
        assert len(room_rows)==rooms and all(len(x)==13 for x in room_rows)
        stats = [list(map(int,x[:8])) for x in room_rows]
        steps,skips,total_ns,_,delay_ns,_,snaps,events = map(sum,zip(*stats))
        assert steps+skips==row["expected_steps"] and steps>0
        step_hist,del_hist,solve_hist=Counter(),Counter(),Counter()
        for x in room_rows:
            for hist,s in zip((step_hist,del_hist,solve_hist),(x[8],x[9],x[12])):
                for kv in filter(None,s.split(";")):
                    k,v=map(int,kv.split(":"))
                    hist[k]+=v
        assert sum(step_hist.values())==sum(del_hist.values())==sum(solve_hist.values())==steps
        pre=[s for s in samples if s[0] < start]
        active=[s for s in samples if start <= s[0] <= end]
        destroyed=int(next(x for x in lines if x.startswith("DESTROYED,")).split(",")[1])
        post=[s for s in samples if destroyed < s[0]]
        assert len(active)>=2 and pre and post
        cpu_pct=100*(active[-1][1]-active[0][1])*1e9/(active[-1][0]-active[0][0])
        return row|dict(status="ok" if not skips else "missed_steps",steps=steps,missed=skips,
            cpu_one_core_pct=round(cpu_pct,3),rss_ready_kib=pre[-1][2],
            rss_peak_kib=max(s[2] for s in active),rss_after_kib=post[-1][2],snapshots=snaps,collision_events=events,
            step_mean_us=round(total_ns/steps/1000,3),step_p95_lower_us=quantile(step_hist,1,steps,.95),
            step_max_us=round(max(s[3] for s in stats)/1000,3),
            solve_mean_us=round(sum(int(s[10]) for s in room_rows)/steps/1000,3),
            solve_p95_lower_us=quantile(solve_hist,1,steps,.95),
            solve_max_us=round(max(int(s[11]) for s in room_rows)/1000,3),
            delay_mean_ms=round(delay_ns/steps/1e6,4),delay_p95_lower_ms=quantile(del_hist,.1,steps,.95),
            delay_max_ms=round(max(s[5] for s in stats)/1e6,4),
            worst_room_missed=max(s[1] for s in stats))
    except (AssertionError,ValueError, IndexError,StopIteration) as e:
        return row|{"status":"invalid_output","diagnostic":repr(e)}

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--seconds",default=60,type=int)
    ap.add_argument("--engines",default="world",help="comma-separated world and/or baseline")
    ap.add_argument("--rates",default="20,60")
    ap.add_argument("--rooms",default="1,8,32,64,128")
    ap.add_argument("--out",default="results")
    a=ap.parse_args()
    assert 0<a.seconds<=3600
    rates=[int(x) for x in a.rates.split(",")]
    rooms=[int(x) for x in a.rooms.split(",")]
    engines=a.engines.split(",")
    assert set(engines)<={"world","baseline"} and set(rates)<={20,60}
    assert all(0<n<=128 for n in rooms)
    out=Path(a.out)
    out.mkdir(parents=True,exist_ok=True)
    (out/"environment.json").write_text(json.dumps(metadata(),indent=2)+"\n")
    good=True
    with (out/"summary.jsonl").open("w") as f:
        for kind in engines:
            for hz in rates:
                for count in rooms:
                    row=measure(kind,count,hz,a.seconds,out)
                    good &= row["status"]=="ok"
                    line=json.dumps(row)
                    f.write(line+"\n");f.flush()
                    print(line,flush=True)
    return 0 if good else 1

if __name__=="__main__":
    raise SystemExit(main())
