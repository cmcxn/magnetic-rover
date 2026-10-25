"""Assemble the portable Windows package; invoked by package-windows.sh."""
import hashlib
import json
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path


def validate(root, runtime, output, name):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", name) or name.endswith("."):
        raise ValueError("Package name must be an ASCII filename (letters, numbers, ., _, -)")
    stem = name.split(".", 1)[0].upper()
    if stem in {"CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$"} or re.fullmatch(r"(?:COM|LPT)[1-9]", stem):
        raise ValueError("Package name is a reserved Windows device name")
    if (output / (name + ".zip")).exists() or (output / (name + ".zip.sha256")).exists():
        raise ValueError("Output already exists; choose another --name")
    for item in ("skynet.exe", "skynet.dll", "lua.exe", "lua54.dll", "BUILD-INFO.json",
                 "lualib/loader.lua", "service/bootstrap.lua", "cservice/snlua.so"):
        if not (runtime / item).is_file():
            raise ValueError(f"Missing Windows runtime file: {runtime / item}")
    for item in ("cservice", "luaclib", "lualib", "service", "licenses", "certs"):
        if not (runtime / item).is_dir():
            raise ValueError(f"Missing runtime directory: {runtime / item}")
    # .so files in this distribution are Windows DLLs, not Linux shared objects.
    for file in runtime.rglob("*"):
        if file.suffix.lower() not in (".exe", ".dll", ".so") or not file.is_file():
            continue
        with file.open("rb") as stream:
            header = stream.read(64)
            if len(header) < 64 or header[:2] != b"MZ":
                raise ValueError(f"Not a Windows PE binary: {file}")
            stream.seek(struct.unpack_from("<I", header, 60)[0])
            pe = stream.read(6)
            if pe != b"PE\0\0\x64\x86":
                raise ValueError(f"Not a Windows x64 binary: {file}")
    json.loads((runtime / "BUILD-INFO.json").read_text(encoding="utf-8"))


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def assemble(root, runtime, output, name):
    output.mkdir(parents=True, exist_ok=True)
    # Stage on the output filesystem; never modify the downloaded runtime.
    with tempfile.TemporaryDirectory(prefix=".rover-windows-", dir=output) as temp:
        stage = Path(temp) / name
        stage.mkdir()
        target = stage / "runtime"
        target.mkdir()
        for dirname in ("cservice", "luaclib", "lualib", "service", "licenses", "certs"):
            shutil.copytree(runtime / dirname, target / dirname,
                            ignore=shutil.ignore_patterns(".DS_Store", "__pycache__", "*.log", "*.pid"))
        for filename in ("skynet.exe", "skynet.dll", "lua.exe", "lua54.dll", "luac.exe",
                         "BUILD-INFO.json", "README.txt", "RELEASE-NOTES.txt", "native-files.txt"):
            if (runtime / filename).is_file():
                shutil.copy2(runtime / filename, target / filename)
        (stage / "server").mkdir()
        for file in sorted((root / "server").glob("*.lua")):
            if not file.name.startswith("test_"):
                shutil.copy2(file, stage / "server" / file.name)
        shutil.copy2(root / "server/config", stage / "server/config")
        shutil.copytree(root / "client/dist", stage / "client/dist")
        shutil.copytree(root / "licenses", stage / "licenses")
        for file in (root / "packaging/windows").iterdir():
            if not file.is_file():
                continue
            text = file.read_text(encoding="utf-8")
            # cmd.exe batch files use ASCII and CRLF; Chinese instructions use UTF-8.
            (stage / file.name).write_bytes(text.replace("\r\n", "\n").replace("\n", "\r\n").encode("utf-8"))
        revision = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=root, text=True).strip()
        changes = subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=normal"], cwd=root, text=True)
        info = {
            "name": name, "platform": "windows/x64", "game_commit": revision,
            "working_tree_modified": bool(changes.strip()),
            "built_at_utc": datetime.now(timezone.utc).isoformat(),
            "runtime": json.loads((runtime / "BUILD-INFO.json").read_text(encoding="utf-8")),
            "verification": "Build, archive integrity and PE architecture checked; see README.txt for runtime validation limits.",
        }
        (stage / "BUILD-INFO.json").write_text(json.dumps(info, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        files = sorted(p for p in stage.rglob("*") if p.is_file())
        (stage / "SHA256SUMS").write_text("".join(f"{sha256(p)}  {p.relative_to(stage).as_posix()}\n" for p in files), encoding="utf-8")
        archive = Path(temp) / (name + ".zip")
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as z:
            for file in sorted(stage.rglob("*")):
                if file.is_file():
                    z.write(file, file.relative_to(stage.parent).as_posix())
        with zipfile.ZipFile(archive) as z:
            bad = z.testzip()
            if bad:
                raise ValueError(f"ZIP integrity failure: {bad}")
        final = output / archive.name
        # Exclusive creation protects a previous package even if another build finishes first.
        with final.open("xb") as out, archive.open("rb") as source:
            shutil.copyfileobj(source, out)
        checksum = output / (final.name + ".sha256")
        with checksum.open("x", encoding="utf-8") as stream:
            stream.write(f"{sha256(final)}  {final.name}\n")
        print(f"Package: {final}\nSHA256: {checksum}\nSize: {final.stat().st_size / 1024 / 1024:.1f} MiB")


def main():
    args = sys.argv[1:]
    check = bool(args and args[0] == "--check")
    if check:
        args = args[1:]
    if len(args) != 4:
        raise ValueError("Expected ROOT RUNTIME OUTPUT NAME")
    root, runtime, output = (Path(p).expanduser().resolve() for p in args[:3])
    name = args[3]
    validate(root, runtime, output, name)
    if check:
        print(f"Windows x64 runtime validated: {runtime}")
    else:
        assemble(root, runtime, output, name)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print(f"Packaging failed: {error}", file=sys.stderr)
        sys.exit(1)
