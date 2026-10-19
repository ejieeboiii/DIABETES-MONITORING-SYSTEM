param(
    [string]$Fqbn = 'esp32:esp32:esp32',
    [string]$ArduinoCli = '',
    [string]$ArduinoData = '',
    [string]$ArduinoUser = ''
)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$buildRoot = Join-Path $repoRoot 'output/step6'
$sketchRoot = Join-Path $buildRoot 'public-sketch/esp32_breathdx'
New-Item -ItemType Directory -Path $sketchRoot -Force | Out-Null
if (!$ArduinoCli) {
    $cliCommand = Get-Command arduino-cli -ErrorAction SilentlyContinue
    if ($cliCommand) { $ArduinoCli = $cliCommand.Source }
    else { $ArduinoCli = Join-Path $env:LOCALAPPDATA 'Programs/Arduino IDE/resources/app/lib/backend/resources/arduino-cli.exe' }
}
if (!(Test-Path -LiteralPath $ArduinoCli)) { throw 'Arduino CLI not installed. Supply -ArduinoCli; no dependencies will be installed.' }
if (!$ArduinoData) { $ArduinoData = Join-Path $env:LOCALAPPDATA 'Arduino15' }
if (!$ArduinoUser) { $ArduinoUser = Join-Path $env:USERPROFILE 'Documents/Arduino' }
if (!(Test-Path -LiteralPath (Join-Path $ArduinoData 'package_index.json'))) { throw 'Installed Arduino index unavailable; supply -ArduinoData.' }
$configPath = Join-Path $buildRoot 'arduino-cli.yaml'
$dataPath = $ArduinoData.Replace('\', '/')
$userPath = $ArduinoUser.Replace('\', '/')
@"
directories:
  data: '$dataPath'
  downloads: '$dataPath/staging'
  user: '$userPath'
"@ | Set-Content -LiteralPath $configPath

# Deliberately exclude private headers. Public verification cannot embed secrets.
# Refuse reuse of a test sketch into which someone added private configuration.
foreach ($private in @('device_secrets.h', 'sensor_config.h')) {
    if (Test-Path -LiteralPath (Join-Path $sketchRoot $private)) { throw "Unexpected private header in test sketch: $private. Choose a clean test location." }
}
foreach ($file in @('esp32_breathdx.ino', 'sensor_config_defaults.h', 'acquisition_core.h', 'acquisition_core_tests.h')) {
    Copy-Item -LiteralPath (Join-Path $repoRoot "iot-prototype/esp32/esp32_breathdx/$file") -Destination (Join-Path $sketchRoot $file)
}
foreach ($profile in @('default', 'pin-probe')) {
    $flags = '-DBREATHDX_COMPILE_SELF_TESTS'
    if ($profile -eq 'pin-probe') {
        # Compiler fixtures only; not proposed wiring. Acquisition remains disabled.
        $flags += ' -DTGS822_PIN=34 -DTGS2620_PIN=35 -DDHT_PIN=4'
    }
    & $ArduinoCli --config-file $configPath compile --fqbn $Fqbn --jobs 2 `
        --build-property "compiler.cpp.extra_flags=$flags" --build-path (Join-Path $buildRoot "build-$profile") $sketchRoot
    if ($LASTEXITCODE -ne 0) { throw "Firmware compilation failed for $profile." }
    Write-Output "PASS: $profile compile and acquisition assertions ($Fqbn); no upload."
}
