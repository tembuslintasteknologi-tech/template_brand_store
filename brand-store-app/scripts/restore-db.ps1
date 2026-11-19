#requires -Version 7.0
<#
.SYNOPSIS
    Restore database PostgreSQL dari dump custom-format pg_dump.

.DESCRIPTION
    Memakai pg_restore dengan --clean --if-exists sehingga objek lama di database tujuan diganti.
    Ini operasi destruktif: tanpa -Force, skrip menampilkan target lalu meminta konfirmasi.

.PARAMETER DatabaseUrl
    Connection string PostgreSQL. Default diambil dari environment DATABASE_URL.

.PARAMETER File
    Path dump yang akan direstore.

.PARAMETER Force
    Lewati prompt konfirmasi. Hanya pakai di pipeline yang sudah punya approval.

.EXAMPLE
    .\scripts\restore-db.ps1 -File .\backups\brand_store-20261119-020000.dump

.EXAMPLE
    .\scripts\restore-db.ps1 -File .\backups\brand_store-20261119-020000.dump -Force
#>

[CmdletBinding()]
param(
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [Parameter(Mandatory = $true)][string]$File,
    [switch]$Force
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

$resolved = Resolve-Path -LiteralPath $File -ErrorAction SilentlyContinue
if (-not $resolved) {
    throw "File dump tidak ditemukan: $File"
}
$dumpPath = $resolved.Path

$pgRestore = Get-Command pg_restore -ErrorAction SilentlyContinue
if (-not $pgRestore) {
    throw "pg_restore tidak ditemukan di PATH. Pasang PostgreSQL client atau tambahkan folder bin-nya ke PATH."
}

$conn = ConvertFrom-PostgresUrl -Url $DatabaseUrl

if (-not $Force) {
    $answer = Read-Host "Restore $dumpPath ke $($conn.Database)@$($conn.Host):$($conn.Port)? Objek lama akan diganti. Ketik RESTORE"
    if ($answer -ne 'RESTORE') {
        Write-Host 'Dibatalkan.'
        exit 1
    }
}

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

    Write-Host "Restore $dumpPath ke $($conn.Database)@$($conn.Host):$($conn.Port)"

    & $pgRestore.Source --clean --if-exists --no-owner --no-privileges --exit-on-error $dumpPath
    if ($LASTEXITCODE -ne 0) {
        throw "pg_restore gagal dengan exit code $LASTEXITCODE."
    }
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

Write-Host 'Restore selesai. Jalankan hitungan pada tabel inti untuk membuktikan isi database.'
