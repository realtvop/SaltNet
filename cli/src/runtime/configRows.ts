/**
 * The settings as `config list` and `config get` print them: one row for each, with the value now
 * in force, where it comes from and what the setting would be without the environment and
 * `config.json`.
 */
import type { ConfigDefinition, ConfigSource, ConfigValue, ResolvedConfig } from "./config";
import { getBuildDefaults } from "./buildDefaults";
import {
    CONFIG_DEFINITIONS,
    configEnvName,
    defaultConfigValue,
    describeConfigKind,
} from "./config";

export interface SettingRow {
    /** The dotted name, as `config get` and `config set` take it. */
    readonly key: string;
    /** The value in force. */
    readonly value: ConfigValue;
    /** `env` an environment variable, `file` config.json, `build` the web app's `.env` at build time, `default` built in. */
    readonly source: ConfigSource;
    /** What the setting is without the environment and `config.json`. */
    readonly default: ConfigValue;
    /** The environment variable that overrides the setting. */
    readonly env: string;
    /** What the setting accepts, in words. */
    readonly type: string;
    readonly description: string;
}

/** The row of one setting. `version` is the CLI's, which the default of the user agent contains. */
export function settingRow(
    definition: ConfigDefinition,
    config: ResolvedConfig,
    version: string
): SettingRow {
    const { key } = definition;
    const [group, name] = key.split(".");
    const values = config.values as unknown as Record<string, Record<string, ConfigValue>>;
    return {
        key,
        value: values[group][name],
        source: config.sources[definition.key],
        default: defaultConfigValue(definition, { build: getBuildDefaults(), version }).value,
        env: configEnvName(definition.key),
        type: describeConfigKind(definition.kind),
        description: definition.description,
    };
}

/** Every setting, in the order the settings table has them. */
export function settingRows(config: ResolvedConfig, version: string): SettingRow[] {
    return CONFIG_DEFINITIONS.map(definition => settingRow(definition, config, version));
}
