$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sampleDir = Join-Path $projectRoot 'samples'
$containerSampleDir = '/tmp/vision-inference-samples'

Push-Location $projectRoot
try {
    docker compose exec -T inference python /service/generate_sample_media.py $containerSampleDir
    if ($LASTEXITCODE -ne 0) { throw 'Sample generation failed inside the inference container.' }

    New-Item -ItemType Directory -Path $sampleDir -Force | Out-Null
    docker cp "vision-inference:$containerSampleDir/sample-image.jpg" (Join-Path $sampleDir 'sample-image.jpg')
    if ($LASTEXITCODE -ne 0) { throw 'Could not copy the sample JPEG from the inference container.' }
    docker cp "vision-inference:$containerSampleDir/sample-video.mp4" (Join-Path $sampleDir 'sample-video.mp4')
    if ($LASTEXITCODE -ne 0) { throw 'Could not copy the sample MP4 from the inference container.' }

    Write-Output "Synthetic Postman samples created in $sampleDir"
}
finally {
    Pop-Location
}
