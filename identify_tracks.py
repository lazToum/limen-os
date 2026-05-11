import asyncio
import os
import sys
import subprocess
import json
from shazamio import Shazam

async def identify_segment(shazam, file_path):
    try:
        out = await shazam.recognize(file_path)
        if 'track' in out:
            track = out['track']
            return {
                'title': track.get('title'),
                'subtitle': track.get('subtitle'),
                'artist': track.get('subtitle'),
                'key': track.get('key')
            }
    except Exception as e:
        print(f"Error identifying {file_path}: {e}")
    return None

def get_duration(file_path):
    cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", file_path
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    return int(float(result.stdout.strip()))

async def main():
    if len(sys.argv) < 2:
        print("Usage: python3 identify_tracks.py <video_file>")
        sys.exit(1)
        
    video_path = sys.argv[1]
    if not os.path.exists(video_path):
        print(f"File not found: {video_path}")
        sys.exit(1)

    duration = get_duration(video_path)
    interval = 120 # 2 minutes
    sample_duration = 30
    
    shazam = Shazam()
    results = []
    
    tmp_dir = "tmp_audio_segments"
    os.makedirs(tmp_dir, exist_ok=True)
    
    print(f"Starting identification for {video_path} (Duration: {duration}s)")
    
    for start_time in range(0, duration, interval):
        segment_path = os.path.join(tmp_dir, f"segment_{start_time}.mp3")
        
        # Extract 30s segment
        cmd = [
            "ffmpeg", "-y", "-ss", str(start_time), "-t", str(sample_duration),
            "-i", video_path, "-vn", "-acodec", "libmp3lame", "-q:a", "2",
            segment_path
        ]
        
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        print(f"[{start_time // 60:02d}:{start_time % 60:02d}] Identifying...", end=" ", flush=True)
        
        track_info = await identify_segment(shazam, segment_path)
        if track_info:
            print(f"Found: {track_info['title']} - {track_info['subtitle']}")
            results.append({
                'timestamp': start_time,
                'track': track_info
            })
        else:
            print("Not found")
            
        if os.path.exists(segment_path):
            os.remove(segment_path)
            
    output_json = "tracklist_results.json"
    with open(output_json, "w") as f:
        json.dump(results, f, indent=4)
        
    print(f"\nIdentification complete. Results saved to {output_json}")

if __name__ == "__main__":
    asyncio.run(main())
