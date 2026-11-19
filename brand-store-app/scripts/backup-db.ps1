#requires -Version 7.0
<#
.SYNOPSIS
    Backup database PostgreSQL dari DATABASE_URL ke file custom-format pg_dump.

.DESCRIPTION
    Kredensial tidak diletakkan di argumen proses. URL dipecah menjadi variabel PG* supaya
    password tidak muncul di daftar proses mesin lain. Format dump adalah custom (-Fc) agar
    bisa direstore selektif dengan pg_restore -t nama_tabel.

.PARAMETER DatabaseUrl
    Connection string PostgreSQL. Default diambil dari environment DATABASE_URL.

.PARAMETER OutputDir
    Folder tujuan. Dibuat otomatis bila belum ada. Default .\backups.

.PARAMETER RetainDays
    Hapus dump yang lebih tua dari jumlah hari ini. 0 berarti tidak menghapus apa pun.

.EXAMPLE
    .\scripts\backup-db.ps1

.EXAMPLE
    .\scripts\backup-db.ps1 -DatabaseUrl "postgres://user:pass@db:5432/brand_store" -OutputDir "D:\backup\brand" -RetainDays 30
#>

[CmdletBinding()]
param(
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [string]$OutputDir = (Join-Path (Get-Location) 'backups'),
    [int]$RetainDays = 30
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function ConvertFrom-PostgresUrl {
    param([Parameter(Mandatory = $true)][string]$Url)

    $uri = $null
    if (-not [System.Uri]::TryCreate($Url, [System.UriKind]::Absolute, [ref]$uri)) {
        throw "DATABASE_URL bukan URL yang valid."
    }
    if ($uri.Scheme -notin @('postgres', 'postgresql')) {
        throw "DATABASE_URL harus memakai skema postgres atau postgresql."
    }

    $user = ''
    $password = ''
    if ($uri.UserInfo) {
        $parts = $uri.UserInfo.Split(':', 2)
        $user = [System.Uri]::UnescapeDataString($parts[0])
        if ($parts.Length -gt 1) {
            $password = [System.Uri]::UnescapeDataString($parts[1])
        }
    }

    $database = $uri.AbsolutePath.TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($database)) {
        throw "DATABASE_URL tidak memuat nama database."
    }

    $sslmode = ''
    if ($uri.Query) {
        foreach ($pair in $uri.Query.TrimStart('?').Split('&')) {
            $kv = $pair.Split('=', 2)
            if ($kv.Length -eq 2 -and $kv[0] -eq 'sslmode') {
                $sslmode = [System.Uri]::UnescapeDataString($kv[1])
            }
        }
    }

    return [pscustomobject]@{
        Host     = $uri.Host
        Port     = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
        User     = $user
        Password = $password
        Database = $database
        SslMode  = $sslmode
    }
}

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    throw "DATABASE_URL kosong. Isi environment DATABASE_URL atau pakai -DatabaseUrl."
}

$pgDump = Get-Command pg_dump -ErrorAction SilentlyContinue
if (-not $pgDump) {
    throw "pg_dump tidak ditemukan di PATH. Pasang PostgreSQL client atau tambahkan folder bin-nya ke PATH."
}

$conn = ConvertFrom-PostgresUrl -Url $DatabaseUrl

if (-not (Test-Path -LiteralPath $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$safeName = ($conn.Database -replace '[^A-Za-z0-9_-]', '_')
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$fileName = "$safeName-$stamp.dump"
$filePath = Join-Path $OutputDir $fileName

# Kredensial hanya masuk environment proses anak, tidak ke argumen command line.
$previous = @{
    PGHOST     = $env:PGHOST
    PGPORT     = $env:PGPORT
    PGUSER     = $env:PGUSER
    PGPASSWORD = $env:PGPASSWORD
    PGDATABASE = $env:PGDATABASE
    PGSSLMODE  = $env:PGSSLMODE
}

try {
    $env:PGHOST = $conn.Host
    $env:PGPORT = [string]$conn.Port
    if ($conn.User) { $env:PGUSER = $conn.User }
    if ($conn.Password) { $env:PGPASSWORD = $conn.Password }
    $env:PGDATABASE = $conn.Database
    if ($conn.SslMode) { $env:PGSSLMODE = $conn.SslMode }

    Write-Host "Backup $($conn.Database)@$($conn.Host):$($conn.Port) ke $filePath"

    & $pgDump.Source --format=custom --no-owner --no-privileges --compress=6 --file $filePath
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump gagal dengan exit code $LASTEXITCODE."
    }
}
catch {
    # pg_dump bisa meninggalkan file kosong saat koneksi gagal. Jangan biarkan file itu
    # terlihat seperti backup yang sah.
    if (Test-Path -LiteralPath $filePath) {
        Remove-Item -LiteralPath $filePath -Force -ErrorAction SilentlyContinue
    }
    throw
}
finally {
    foreach ($key in $previous.Keys) {
        $value = $previous[$key]
        if ([string]::IsNullOrEmpty($value)) {
            Remove-Item -Path "env:$key" -ErrorAction SilentlyContinue
        }
        else {
            Set-Item -Path "env:$key" -Value $value
        }
    }
}

if (-not (Test-Path -LiteralPath $filePath)) {
    throw "pg_dump selesai tanpa error tetapi file dump tidak ditemukan."
}

$info = Get-Item -LiteralPath $filePath
Write-Host ("Selesai: {0} ({1:N2} MB)" -f $info.Name, ($info.Length / 1MB))

if ($RetainDays -gt 0) {
    $cutoff = (Get-Date).AddDays(-$RetainDays)
    $old = Get-ChildItem -LiteralPath $OutputDir -Filter "$safeName-*.dump" -File |
        Where-Object { $_.LastWriteTime -lt $cutoff }

    foreach ($item in $old) {
        Remove-Item -LiteralPath $item.FullName -Force
        Write-Host "Hapus dump lama: $($item.Name)"
    }
}
