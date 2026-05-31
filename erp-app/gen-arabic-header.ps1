# Generate arabic-header.png with correct Arabic text using Windows GDI+
Add-Type -AssemblyName System.Drawing

$width  = 600
$height = 160
$bmp    = New-Object System.Drawing.Bitmap($width, $height)
$g      = [System.Drawing.Graphics]::FromImage($bmp)

$g.Clear([System.Drawing.Color]::White)
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

$blue  = [System.Drawing.Color]::FromArgb(26, 80, 150)
$brush = New-Object System.Drawing.SolidBrush($blue)

$font1 = New-Object System.Drawing.Font("Sakkal Majalla", 52, [System.Drawing.FontStyle]::Bold)
$font2 = New-Object System.Drawing.Font("Sakkal Majalla", 36, [System.Drawing.FontStyle]::Bold)

$sf = New-Object System.Drawing.StringFormat
$sf.Alignment     = [System.Drawing.StringAlignment]::Far
$sf.LineAlignment = [System.Drawing.StringAlignment]::Near
$sf.FormatFlags   = [System.Drawing.StringFormatFlags]::DirectionRightToLeft

$line1 = [System.String]::new([char[]]@(0x634,0x631,0x643,0x629,0x20,0x62F,0x627,0x64A,0x646,0x627,0x645,0x64A,0x643,0x20,0x644,0x627,0x64A,0x646))
$line2 = [System.String]::new([char[]]@(0x627,0x644,0x62F,0x648,0x644,0x64A,0x629,0x20,0x644,0x644,0x62A,0x62C,0x627,0x631,0x629))

$rect1 = New-Object System.Drawing.RectangleF(10, 5, 580, 90)
$rect2 = New-Object System.Drawing.RectangleF(10, 90, 580, 65)

$g.DrawString($line1, $font1, $brush, $rect1, $sf)
$g.DrawString($line2, $font2, $brush, $rect2, $sf)

$g.Dispose()
$outPath = Join-Path $PSScriptRoot "public\arabic-header.png"
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Host "Saved to: $outPath"
