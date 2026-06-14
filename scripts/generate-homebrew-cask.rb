#!/usr/bin/env ruby

require 'digest'
require 'erb'
require 'fileutils'
require 'open-uri'

if ARGV.empty?
  puts "Usage: #{$PROGRAM_NAME} VERSION [OUTPUT]"
  puts "Example: #{$PROGRAM_NAME} v1.0.0 packaging/homebrew/Casks/ani-desk.rb"
  exit 1
end

version = ARGV[0]
version_without_v = version.gsub(/^v/, '')
release_base = "https://github.com/silent9669/ani-desk/releases/download/v#{version_without_v}"
macos_arm_url = "#{release_base}/ani-desk_#{version_without_v}_aarch64.dmg"
macos_intel_url = "#{release_base}/ani-desk_#{version_without_v}_x64.dmg"

def sha256_for(url, placeholder)
  filename = File.basename(url)
  local_paths = [
    File.expand_path(File.join(__dir__, '..', 'release-artifacts', filename)),
    File.expand_path(File.join(Dir.pwd, 'release-artifacts', filename)),
    File.expand_path(File.join(Dir.pwd, filename))
  ]

  local_path = local_paths.find { |path| File.exist?(path) }

  if local_path
    puts "Using local file: #{local_path}"
    Digest::SHA256.file(local_path).hexdigest
  else
    Digest::SHA256.hexdigest(URI.open(url).read)
  end
rescue OpenURI::HTTPError, SocketError
  return placeholder if ENV['HOMEBREW_CASK_ALLOW_PLACEHOLDERS'] == '1'

  raise
end

macos_arm_sha256 = sha256_for(macos_arm_url, 'PLACEHOLDER_SHA256_ARM64_DMG')
macos_intel_sha256 = sha256_for(macos_intel_url, 'PLACEHOLDER_SHA256_X64_DMG')

template_path = File.join(__dir__, '..', 'packaging', 'homebrew', 'Casks', 'ani-desk.rb.template')
unless File.exist?(template_path)
  warn "Template not found at #{template_path}"
  exit 1
end

cask = ERB.new(File.read(template_path), trim_mode: '-').result(binding)
IO.popen(['ruby', '-c'], 'r+') do |io|
  io.write(cask)
  io.close_write
  result = io.read
  unless result.include?('Syntax OK')
    warn result
    exit 1
  end
end

output_path = ARGV[1] || 'ani-desk.rb'
FileUtils.mkdir_p(File.dirname(output_path)) if output_path.include?(File::SEPARATOR)
File.write(output_path, cask)
puts "Generated cask: #{output_path}"
