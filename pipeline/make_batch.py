"""Emit a concrete batch script from the generic auto template + the current band.

  python pipeline/make_batch.py N [--size 18]

Reads pipeline/annotation_band.json (produced by gen_band.py), takes the top
--size events, injects them as the PACKET literal into a copy of
annotation-batch-auto.js, and writes annotation-batch-N.js. Writing the literal
here (UTF-8) avoids passing the packet through the console as `args` (which would
mojibake Spanish accents). Prints the output path."""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BW = ROOT / "pipeline" / "batch_workflows"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("n", type=int)
    ap.add_argument("--size", type=int, default=18)
    ap.add_argument("--band", default=str(ROOT / "pipeline" / "annotation_band.json"))
    args = ap.parse_args()

    band = json.loads(Path(args.band).read_text(encoding="utf-8"))
    packet = band[: args.size]
    if not packet:
        raise SystemExit("band is empty — nothing to batch")

    tpl = (BW / "annotation-batch-auto.js").read_text(encoding="utf-8")
    # swap the args-driven PACKET preamble for an inline literal
    preamble = re.compile(
        r"// PACKET is supplied.*?pass the batch slice via args'\)\n",
        re.S,
    )
    literal = "const PACKET = " + json.dumps(packet, ensure_ascii=False) + "\n"
    tpl, nsub = preamble.subn(literal, tpl, count=1)
    if nsub != 1:
        raise SystemExit("could not find the PACKET preamble to replace")
    tpl = tpl.replace("name: 'annotation-batch-auto',", f"name: 'annotation-batch-{args.n}',")
    tpl = tpl.replace(
        "description: 'Corroborate a packet of CNMH events (passed via args) — ",
        f"description: 'Corroborate {len(packet)} CNMH events (victims "
        f"{packet[0]['codedVictims']}-{packet[-1]['codedVictims']}) — ",
    )

    out = BW / f"annotation-batch-{args.n}.js"
    # Write LF-only: the Workflow approval validator rejects scripts containing
    # CR (0x0d) as "hidden control characters". Binary write avoids Windows
    # text-mode CRLF translation.
    out.write_bytes(tpl.replace("\r\n", "\n").encode("utf-8"))
    print(str(out))
    print(f"  {len(packet)} events, victims {packet[0]['codedVictims']}..{packet[-1]['codedVictims']}, "
          f"idCasos {[p['idCaso'] for p in packet]}")


if __name__ == "__main__":
    main()
