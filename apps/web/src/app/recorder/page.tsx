"use client"

import { useCallback, useRef, useState } from "react"
import {
  AlertCircle,
  Check,
  Cloud,
  CloudOff,
  Download,
  HardDrive,
  Loader2,
  Mic,
  Pause,
  Play,
  RefreshCw,
  Square,
  Trash2,
  Upload,
} from "lucide-react"

import { Button } from "@my-better-t-app/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@my-better-t-app/ui/components/card"
import { LiveWaveform } from "@/components/ui/live-waveform"
import { useRecorder, type WavChunk, type SyncStatus } from "@/hooks/use-recorder"

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.floor((seconds % 1) * 10)
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`
}

function formatDuration(seconds: number) {
  return `${seconds.toFixed(1)}s`
}

function UploadStatusBadge({ status }: { status: WavChunk["uploadStatus"] }) {
  switch (status) {
    case "pending":
      return (
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Upload className="size-3" />
          Pending
        </span>
      )
    case "uploading":
      return (
        <span className="flex items-center gap-1 text-[10px] text-blue-500">
          <Loader2 className="size-3 animate-spin" />
          Uploading
        </span>
      )
    case "uploaded":
      return (
        <span className="flex items-center gap-1 text-[10px] text-amber-500">
          <Cloud className="size-3" />
          Uploaded
        </span>
      )
    case "acknowledged":
      return (
        <span className="flex items-center gap-1 text-[10px] text-green-500">
          <Check className="size-3" />
          Synced
        </span>
      )
    case "failed":
      return (
        <span className="flex items-center gap-1 text-[10px] text-destructive">
          <AlertCircle className="size-3" />
          Failed
        </span>
      )
  }
}

function SyncStatusIndicator({
  status,
  progress,
}: {
  status: SyncStatus
  progress: { total: number; acknowledged: number; percentage: number }
}) {
  if (progress.total === 0) return null

  return (
    <div className="flex items-center gap-2 text-sm">
      {status === "syncing" && (
        <>
          <Loader2 className="size-4 animate-spin text-blue-500" />
          <span>Syncing {progress.acknowledged}/{progress.total}</span>
        </>
      )}
      {status === "synced" && (
        <>
          <Check className="size-4 text-green-500" />
          <span className="text-green-500">All synced</span>
        </>
      )}
      {status === "idle" && progress.acknowledged < progress.total && (
        <>
          <Cloud className="size-4 text-muted-foreground" />
          <span>{progress.acknowledged}/{progress.total} synced</span>
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle className="size-4 text-destructive" />
          <span className="text-destructive">Sync error</span>
        </>
      )}
    </div>
  )
}

function ChunkRow({ chunk, index }: { chunk: WavChunk; index: number }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)

  const toggle = () => {
    const el = audioRef.current
    if (!el) return
    if (playing) {
      el.pause()
      el.currentTime = 0
      setPlaying(false)
    } else {
      el.play()
      setPlaying(true)
    }
  }

  const download = () => {
    const a = document.createElement("a")
    a.href = chunk.url
    a.download = `chunk-${index + 1}.wav`
    a.click()
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-sm border border-border/50 bg-muted/30 px-3 py-2">
      <audio
        ref={audioRef}
        src={chunk.url}
        onEnded={() => setPlaying(false)}
        preload="none"
      />
      <span className="text-xs font-medium text-muted-foreground tabular-nums">
        #{index + 1}
      </span>
      <span className="text-xs tabular-nums">{formatDuration(chunk.duration)}</span>
      <UploadStatusBadge status={chunk.uploadStatus} />
      <div className="ml-auto flex gap-1">
        <Button variant="ghost" size="icon-xs" onClick={toggle}>
          {playing ? <Square className="size-3" /> : <Play className="size-3" />}
        </Button>
        <Button variant="ghost" size="icon-xs" onClick={download}>
          <Download className="size-3" />
        </Button>
      </div>
    </div>
  )
}

export default function RecorderPage() {
  const [deviceId] = useState<string | undefined>()
  const {
    status,
    start,
    stop,
    pause,
    resume,
    chunks,
    elapsed,
    stream,
    clearChunks,
    recordingId,
    syncStatus,
    opfsSupported,
    retryFailedChunks,
    getUploadProgress,
  } = useRecorder({ chunkDuration: 5, deviceId, autoUpload: true })

  const isRecording = status === "recording"
  const isPaused = status === "paused"
  const isActive = isRecording || isPaused
  const progress = getUploadProgress()
  const hasFailedChunks = progress.failed > 0

  const handlePrimary = useCallback(() => {
    if (isActive) {
      stop()
    } else {
      start()
    }
  }, [isActive, stop, start])

  return (
    <div className="container mx-auto flex max-w-lg flex-col items-center gap-6 px-4 py-8">
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Recorder</CardTitle>
              <CardDescription>16 kHz / 16-bit PCM WAV — chunked every 5 s</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {opfsSupported ? (
                <span className="flex items-center gap-1 text-[10px] text-green-600">
                  <HardDrive className="size-3" />
                  OPFS
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-amber-500">
                  <CloudOff className="size-3" />
                  No OPFS
                </span>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          {/* Waveform */}
          <div className="overflow-hidden rounded-sm border border-border/50 bg-muted/20 text-foreground">
            <LiveWaveform
              active={isRecording}
              processing={isPaused}
              stream={stream}
              height={80}
              barWidth={3}
              barGap={1}
              barRadius={2}
              sensitivity={1.8}
              smoothingTimeConstant={0.85}
              fadeEdges
              fadeWidth={32}
              mode="static"
            />
          </div>

          {/* Timer */}
          <div className="text-center font-mono text-3xl tabular-nums tracking-tight">
            {formatTime(elapsed)}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-3">
            {/* Record / Stop */}
            <Button
              size="lg"
              variant={isActive ? "destructive" : "default"}
              className="gap-2 px-5"
              onClick={handlePrimary}
              disabled={status === "requesting"}
            >
              {isActive ? (
                <>
                  <Square className="size-4" />
                  Stop
                </>
              ) : (
                <>
                  <Mic className="size-4" />
                  {status === "requesting" ? "Requesting..." : "Record"}
                </>
              )}
            </Button>

            {/* Pause / Resume */}
            {isActive && (
              <Button
                size="lg"
                variant="outline"
                className="gap-2"
                onClick={isPaused ? resume : pause}
              >
                {isPaused ? (
                  <>
                    <Play className="size-4" />
                    Resume
                  </>
                ) : (
                  <>
                    <Pause className="size-4" />
                    Pause
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Chunks */}
      {chunks.length > 0 && (
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Chunks</CardTitle>
                <CardDescription>{chunks.length} recorded</CardDescription>
              </div>
              <SyncStatusIndicator status={syncStatus} progress={progress} />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {/* Progress bar */}
            {chunks.length > 0 && (
              <div className="mb-2">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Upload Progress</span>
                  <span>{progress.percentage}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-green-500 transition-all duration-300"
                    style={{ width: `${progress.percentage}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                  <span>{progress.acknowledged} synced</span>
                  {progress.uploading > 0 && (
                    <span className="text-blue-500">{progress.uploading} uploading</span>
                  )}
                  {progress.failed > 0 && (
                    <span className="text-destructive">{progress.failed} failed</span>
                  )}
                </div>
              </div>
            )}

            {chunks.map((chunk, i) => (
              <ChunkRow key={chunk.id} chunk={chunk} index={i} />
            ))}

            <div className="mt-2 flex items-center justify-between">
              {hasFailedChunks && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={retryFailedChunks}
                >
                  <RefreshCw className="size-3" />
                  Retry failed
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 ml-auto text-destructive"
                onClick={clearChunks}
              >
                <Trash2 className="size-3" />
                Clear all
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recording ID (for debugging) */}
      {recordingId && (
        <p className="text-xs text-muted-foreground">
          Recording ID: <code className="font-mono">{recordingId}</code>
        </p>
      )}
    </div>
  )
}
