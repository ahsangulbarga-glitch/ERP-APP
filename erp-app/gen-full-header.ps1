# Generate a single combined header PNG — auto-sizes canvas to fit text exactly
Add-Type -AssemblyName System.Drawing

$scriptDir = $PSScriptRoot
$logoPath  = Join-Path $scriptDir "public\dlit-logo.png"
$outPath   = Join-Path $scriptDir "public\dlit-header-full.png"

# Arabic strings via Unicode code points
$line1 = [System.String]::new([char[]]@(0x634,0x631,0x643,0x629,0x20,0x62F,0x627,0x64A,0x646,0x627,0x645,0x64A,0x643,0x20,0x644,0x627,0x64A,0x646))
$line2 = [System.String]::new([char[]]@(0x627,0x644,0x62F,0x648,0x644,0x64A,0x629,0x20,0x644,0x644,0x62A,0x62C,0x627,0x631,0x629))

$font1 = New-Object System.Drawing.Font("Sakkal Majalla", 150, [System.Drawing.FontStyle]::Bold)
$font2 = New-Object System.Drawing.Font("Sakkal Majalla", 105, [System.Drawing.FontStyle]::Bold)

# Measure text widths using a temp bitmap
$tmpBmp = New-Object System.Drawing.Bitmap(100, 100)
$tmpG   = [System.Drawing.Graphics]::FromImage($tmpBmp)
$size1  = $tmpG.MeasureString($line1, $font1)
$size2  = $tmpG.MeasureString($line2, $font2)
$tmpG.Dispose(); $tmpBmp.Dispose()

$textW = [int]([Math]::Max($size1.Width, $size2.Width)) + 20   # +padding

# Logo dimensions
$logoSrc = [System.Drawing.Image]::FromFile($logoPath)
$logoW   = 750
$logoH   = [int]($logoSrc.Height * ($logoW / $logoSrc.Width))

# Canvas: logo + gap + text area, height = tightly fit content
$gap = 40
$H   = [Math]::Max($logoH, [int]($size1.Height + $size2.Height - 60))
$W   = $logoW + $gap + $textW + 20

Write-Host "Canvas: ${W} x ${H}  |  line1: $([int]$size1.Width)px  line2: $([int]$size2.Width)px  logoH: ${logoH}px"

$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g   = [System.Drawing.Graphics]::FromImage($bmp)

$g.Clear([System.Drawing.Color]::White)
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# ── Arabic text position (calculated first so logo can match) ─────────────────
$logoTop    = [int](($H - $logoH) / 2)
$textStartY = $logoTop - 20
$r1y = $textStartY
$r1h = [int]$size1.Height + 5
$r2y = $textStartY + [int]$size1.Height - 80
$r2h = [int]$size2.Height + 5
$arabicBottom = $r2y + $r2h

# ── Logo — top aligned with Arabic, bottom stretched to match Arabic bottom ───
$newLogoTop = $textStartY
$newLogoH   = $arabicBottom - $newLogoTop
$logoRect   = New-Object System.Drawing.Rectangle(0, $newLogoTop, $logoW, $newLogoH)
$g.DrawImage($logoSrc, $logoRect)
$logoSrc.Dispose()

# ── Arabic text (right side) ──────────────────────────────────────────────────
$blue  = [System.Drawing.Color]::FromArgb(26, 80, 150)
$brush = New-Object System.Drawing.SolidBrush($blue)

$sf = New-Object System.Drawing.StringFormat
$sf.Alignment     = [System.Drawing.StringAlignment]::Near
$sf.LineAlignment = [System.Drawing.StringAlignment]::Near
$sf.FormatFlags   = [System.Drawing.StringFormatFlags]::DirectionRightToLeft

$rightX = $logoW + $gap
$rightW = $W - $rightX - 10
$rect1 = New-Object System.Drawing.RectangleF($rightX, $r1y, $rightW, $r1h)
$rect2 = New-Object System.Drawing.RectangleF($rightX, $r2y, $rightW, $r2h)

$g.DrawString($line1, $font1, $brush, $rect1, $sf)
$g.DrawString($line2, $font2, $brush, $rect2, $sf)

$g.Dispose()
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Host "Saved: $outPath"
