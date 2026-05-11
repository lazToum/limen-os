# DJ Set Splitter Tools

These scripts allow you to automatically identify and split tracks from a long DJ set video/audio file.

## Requirements
- `python3.12` (or any version < 3.13 that includes `audioop`)
- `ffmpeg` and `ffprobe`
- `pip install shazamio`

## Workflow

### 1. Identify Tracks
Run the identification script on your video file. It will create `tracklist_results.json`.
```bash
python3.12 identify_tracks.py "path/to/your/set.mov"
```

### 2. Generate Cue & Split Script
Process the JSON results to create a `.cue` file and a `split_tracks.sh` script.
```bash
python3.12 process_results.py tracklist_results.json "path/to/your/set.mov"
```

### 3. Split the Video
Execute the generated shell script to split the video into the `tracks/` folder.
```bash
bash split_tracks.sh
```

## Note on Python Version
As of Python 3.13, the `audioop` module (required by `pydub`/`shazamio`) was removed. Use Python 3.12 or earlier.
