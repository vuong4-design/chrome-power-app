import JSZip from 'jszip';

export type ExportScope = 'all' | 'selected';

export type ExportEntity = 'windows' | 'proxies' | 'profiles';

export const EXPORT_SCHEMA_VERSION = 1;

type BuildExportZipOptions = {
  entity: ExportEntity;
  data: unknown[];
  scope: ExportScope;
};

export const buildExportZip = async ({entity, data, scope}: BuildExportZipOptions) => {
  const zip = new JSZip();
  const metadata = {
    schema_version: EXPORT_SCHEMA_VERSION,
    entity,
    scope,
    exported_at: new Date().toISOString(),
    count: data.length,
  };

  zip.file('metadata.json', JSON.stringify(metadata, null, 2));
  zip.file(`${entity}.json`, JSON.stringify(data, null, 2));

  return zip.generateAsync({type: 'uint8array'});
};
