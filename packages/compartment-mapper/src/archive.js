// @ts-check
/* eslint no-shadow: 0 */

import { writeZip } from '@endo/zip';
import { resolve } from './node-module-specifier.js';
import { compartmentMapForNodeModules } from './node-modules.js';
import { search } from './search.js';
import { assemble } from './assemble.js';
import { makeImportHookMaker } from './import-hook.js';
import { parseJson } from './parse-json.js';
import { parseArchiveCjs } from './parse-archive-cjs.js';
import { parseArchiveMjs } from './parse-archive-mjs.js';
import { parseLocatedJson } from './json.js';

const textEncoder = new TextEncoder();

/** @type {Record<string, ParseFn>} */
const parserForLanguage = {
  mjs: parseArchiveMjs,
  cjs: parseArchiveCjs,
  json: parseJson,
};

/**
 * @param {string} rel - a relative URL
 * @param {string} abs - a fully qualified URL
 * @returns {string}
 */
const resolveLocation = (rel, abs) => new URL(rel, abs).toString();

const { keys, entries, fromEntries } = Object;

/**
 * @param {Record<string, CompartmentDescriptor>} compartments
 * @returns {Record<string, string>} map from old to new compartment names.
 */
const renameCompartments = compartments => {
  /** @type {Record<string, string>} */
  const renames = {};
  let n = 0;
  for (const [name, compartment] of entries(compartments)) {
    const { label } = compartment;
    renames[name] = `${label}-n${n}`;
    n += 1;
  }
  return renames;
};

/**
 * @param {Record<string, CompartmentDescriptor>} compartments
 * @param {Sources} sources
 * @param {Record<string, string>} renames
 */
const translateCompartmentMap = (compartments, sources, renames) => {
  const result = {};
  for (const name of keys(compartments).sort()) {
    const compartment = compartments[name];
    const { label } = compartment;

    // rename module compartments
    /** @type {Record<string, ModuleDescriptor>} */
    const modules = {};
    const compartmentModules = compartment.modules;
    if (compartment.modules) {
      for (const name of keys(compartmentModules).sort()) {
        const module = compartmentModules[name];
        const compartment = module.compartment
          ? renames[module.compartment]
          : undefined;
        modules[name] = {
          ...module,
          compartment,
        };
      }
    }

    // integrate sources into modules
    const compartmentSources = sources[name];
    if (compartmentSources) {
      for (const name of keys(compartmentSources).sort()) {
        const source = compartmentSources[name];
        const { location, parser, exit } = source;
        modules[name] = {
          location,
          parser,
          exit,
        };
      }
    }

    result[renames[name]] = {
      label,
      location: renames[name],
      modules,
      // `scopes`, `types`, and `parsers` are not necessary since every
      // loadable module is captured in `modules`.
    };
  }

  return result;
};

/**
 * @param {Sources} sources
 * @param {Record<string, string>} renames
 * @returns {Sources}
 */
const renameSources = (sources, renames) => {
  return fromEntries(
    entries(sources).map(([name, compartmentSources]) => [
      renames[name],
      compartmentSources,
    ]),
  );
};

/**
 * @param {ArchiveWriter} archive
 * @param {Sources} sources
 */
const addSourcesToArchive = async (archive, sources) => {
  for (const compartment of keys(sources).sort()) {
    const modules = sources[compartment];
    const compartmentLocation = resolveLocation(`${compartment}/`, 'file:///');
    for (const specifier of keys(modules).sort()) {
      const { bytes, location } = modules[specifier];
      if (location !== undefined) {
        const moduleLocation = resolveLocation(location, compartmentLocation);
        const path = new URL(moduleLocation).pathname.slice(1); // elide initial "/"
        if (bytes !== undefined) {
          // eslint-disable-next-line no-await-in-loop
          await archive.write(path, bytes);
        }
      }
    }
  }
};

/**
 * @param {ReadFn} read
 * @param {string} moduleLocation
 * @param {Object} [options]
 * @param {ModuleTransforms} [options.moduleTransforms]
 * @returns {Promise<Uint8Array>}
 */
export const makeArchive = async (read, moduleLocation, options) => {
  const { moduleTransforms } = options || {};
  const {
    packageLocation,
    packageDescriptorText,
    packageDescriptorLocation,
    moduleSpecifier,
  } = await search(read, moduleLocation);

  /** @type {Set<string>} */
  const tags = new Set();

  const packageDescriptor = parseLocatedJson(
    packageDescriptorText,
    packageDescriptorLocation,
  );
  const compartmentMap = await compartmentMapForNodeModules(
    read,
    packageLocation,
    tags,
    packageDescriptor,
    moduleSpecifier,
  );

  const {
    compartments,
    entry: { compartment: entryCompartmentName, module: entryModuleSpecifier },
  } = compartmentMap;
  /** @type {Sources} */
  const sources = {};

  const makeImportHook = makeImportHookMaker(
    read,
    packageLocation,
    sources,
    compartments,
  );

  // Induce importHook to record all the necessary modules to import the given module specifier.
  const compartment = assemble(compartmentMap, {
    resolve,
    makeImportHook,
    moduleTransforms,
    parserForLanguage,
  });
  await compartment.load(entryModuleSpecifier);

  const renames = renameCompartments(compartments);
  const archiveCompartments = translateCompartmentMap(
    compartments,
    sources,
    renames,
  );
  const archiveEntryCompartmentName = renames[entryCompartmentName];
  const archiveSources = renameSources(sources, renames);

  const archiveCompartmentMap = {
    entry: {
      compartment: archiveEntryCompartmentName,
      module: moduleSpecifier,
    },
    compartments: archiveCompartments,
  };
  const archiveCompartmentMapText = JSON.stringify(
    archiveCompartmentMap,
    null,
    2,
  );
  const archiveCompartmentMapBytes = textEncoder.encode(
    archiveCompartmentMapText,
  );

  const archive = writeZip();
  await archive.write('compartment-map.json', archiveCompartmentMapBytes);
  await addSourcesToArchive(archive, archiveSources);

  return archive.snapshot();
};

/**
 * @param {WriteFn} write
 * @param {ReadFn} read
 * @param {string} archiveLocation
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 */
export const writeArchive = async (
  write,
  read,
  archiveLocation,
  moduleLocation,
  options,
) => {
  const archiveBytes = await makeArchive(read, moduleLocation, options);
  await write(archiveLocation, archiveBytes);
};
