// Apply only incoming-share native mods; preserve the app's other native code.
const path = require('path');
const fs = require('fs');
const plistModule = require('@expo/plist');
const plist = plistModule.default || plistModule;
const {compileModsAsync} = require('@expo/config-plugins');
const {getConfig} = require('@expo/config');
const sharingPlugin = require('expo-sharing/app.plugin');
const withSharing = sharingPlugin.default || sharingPlugin;
const projectRoot = path.resolve(__dirname, '..');
const {exp} = getConfig(projectRoot, {skipPlugins: true});
const [, options] = require('../app.json').expo.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-sharing');
compileModsAsync(withSharing(exp, options), {projectRoot, platforms: ['android', 'ios']})
  .then(() => {
    const extensionRoot = path.join(projectRoot, 'ios/expo-sharing-extension');
    const infoPath = path.join(extensionRoot, 'Info.plist');
    const info = plist.parse(fs.readFileSync(infoPath, 'utf8'));
    info.CFBundleDisplayName = exp.name;
    fs.writeFileSync(infoPath, plist.build(info));
    const controllerPath = path.join(extensionRoot, 'ShareIntoViewController.swift');
    const controller = fs.readFileSync(controllerPath, 'utf8').replace(
      'containerURL.appendingPathComponent(fileName)',
      'containerURL.appendingPathComponent("\\(UUID().uuidString)-\\(fileName)")',
    );
    fs.writeFileSync(controllerPath, controller);
    // The plugin's generated optional values must not be serialized as the
    // literal "undefined" in the Xcode project.
    const projectPath = path.join(projectRoot, 'ios/ChatterlyMobile.xcodeproj/project.pbxproj');
    const project = require('xcode').project(projectPath);
    project.parseSync();
    const objects = project.hash.project.objects;
    Object.values(objects.PBXFileReference).forEach(reference => {
      if (typeof reference !== 'object') { return; }
      Object.keys(reference).forEach(key => {
        if (reference[key] === undefined || reference[key] === 'undefined') { delete reference[key]; }
      });
      if (reference.path?.includes('node_modules/expo-sharing/ios/shared/')) {
        const fileName = reference.path.replaceAll('"', '').split('/').pop();
        reference.path = `"../node_modules/expo-sharing/ios/shared/${fileName}"`;
        reference.sourceTree = 'SOURCE_ROOT';
      }
    });
    const targetEntry = Object.entries(objects.PBXNativeTarget).find(([, target]) =>
      typeof target === 'object' && target.name?.replaceAll('"', '') === 'expo-sharing-extension');
    if (targetEntry) {
      const [extensionId] = targetEntry;
      const main = project.getFirstTarget();
      const dependencies = main.firstTarget.dependencies || [];
      if (!dependencies.some(dependency => objects.PBXTargetDependency[dependency.value]?.target === extensionId)) {
        project.addTargetDependency(main.uuid, [extensionId]);
      }
    }
    const mainTarget = project.getFirstTarget().firstTarget;
    const mainConfigurations = objects.XCConfigurationList[mainTarget.buildConfigurationList].buildConfigurations
      .map(entry => objects.XCBuildConfiguration[entry.value]);
    Object.values(objects.XCBuildConfiguration).forEach(configuration => {
      const settings = configuration.buildSettings;
      if (settings?.PRODUCT_BUNDLE_IDENTIFIER?.replaceAll('"', '') === options.ios.extensionBundleIdentifier) {
        settings.INFOPLIST_KEY_CFBundleDisplayName = `"${exp.name}"`;
        const mainSettings = mainConfigurations.find(item => item.name === configuration.name)?.buildSettings;
        ['CURRENT_PROJECT_VERSION', 'MARKETING_VERSION', 'DEVELOPMENT_TEAM'].forEach(key => {
          if (mainSettings?.[key] !== undefined) { settings[key] = mainSettings[key]; }
        });
      }
    });
    fs.writeFileSync(projectPath, project.writeSync());
    process.stdout.write('Applied gallery sharing configuration for Android and iOS.\n');
  })
  .catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
