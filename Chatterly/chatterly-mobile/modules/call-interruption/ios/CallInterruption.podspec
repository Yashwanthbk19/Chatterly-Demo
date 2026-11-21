require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name = 'CallInterruption'
  s.version = package['version']
  s.summary = 'Reports operating system audio interruptions to Chatterly calls.'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Chatterly'
  s.homepage = 'https://github.com/expo/expo'
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.source = { :git => 'https://github.com/expo/expo.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '*.swift'
end
