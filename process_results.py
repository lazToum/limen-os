import json
import sys
import os

def format_cue_time(seconds):
    m = seconds // 60
    s = seconds % 60
    return f"{m:02d}:{s:02d}:00"

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 process_results.py <results_json> <original_video_path>")
        sys.exit(1)
        
    json_path = sys.argv[1]
    video_path = sys.argv[2]
    
    with open(json_path, "r") as f:
        data = json.load(f)

    if not data:
        print("No tracks identified.")
        return

    merged_tracks = []
    last_track_key = None

    for entry in data:
        track = entry['track']
        track_key = (track['title'], track['artist'])
        
        if track_key != last_track_key:
            merged_tracks.append({
                'timestamp': entry['timestamp'],
                'title': track['title'],
                'artist': track['artist']
            })
            last_track_key = track_key

    # Generate CUE file
    cue_filename = os.path.splitext(os.path.basename(video_path))[0] + ".cue"
    cue_content = [f'FILE "{os.path.basename(video_path)}" MP4']
    for i, track in enumerate(merged_tracks):
        cue_content.append(f'  TRACK {i+1:02d} AUDIO')
        cue_content.append(f'    TITLE "{track["title"]}"')
        cue_content.append(f'    PERFORMER "{track["artist"]}"')
        cue_content.append(f'    INDEX 01 {format_cue_time(track["timestamp"])}')

    with open(cue_filename, "w") as f:
        f.write("\n".join(cue_content))

    # Generate split script
    split_script_name = "split_tracks.sh"
    split_script = ["#!/bin/bash", "mkdir -p tracks"]
    for i, track in enumerate(merged_tracks):
        start = track['timestamp']
        if i < len(merged_tracks) - 1:
            duration = merged_tracks[i+1]['timestamp'] - start
            duration_str = f"-t {duration}"
        else:
            duration_str = ""
        
        safe_title = track['title'].replace("/", "-").replace('"', '')
        safe_artist = track['artist'].replace("/", "-").replace('"', '')
        filename = f"tracks/{i+1:02d} - {safe_artist} - {safe_title}.mp4"
        
        split_script.append(f'ffmpeg -y -ss {start} {duration_str} -i "{video_path}" -c copy "{filename}"')

    with open(split_script_name, "w") as f:
        f.write("\n".join(split_script))

    print(f"Generated {cue_filename} and {split_script_name}")

if __name__ == "__main__":
    main()
