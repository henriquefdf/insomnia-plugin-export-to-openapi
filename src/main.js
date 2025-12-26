const { promises: fs } = require('fs');
const path = require('path');
const yaml = require('js-yaml');

function sanitizeForOperationId(name, isPath = false) {
    if (!name) return isPath ? 'root' : 'default';
    let processedName = isPath ? name.replace(/[\/{}]/g, ' ') : name;
    processedName = processedName.replace(/[^a-zA-Z0-9 ]/g, '').trim();
    if (!processedName) return isPath ? 'root' : 'default';
    const parts = processedName.split(/\s+/).filter(p => p);
    if (parts.length === 0) return isPath ? 'root' : 'default';
    return parts[0].toLowerCase() + parts.slice(1).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

function convertUrlToPath(url) {
    if (!url) return '';
    // {{ _.baseURL }}, {{ base_url }}, {{ baseUrl }}, {{baseURL}}, etc.
    let path = url.replace(/\{\{\s*_?\s*\.?\s*(base_?url|baseURL|BASE_?URL)\s*\}\}/gi, '');
    path = path.replace(/\{\{[^}]*\}\}/g, '');
    path = path.replace(/\?.*$/, '');
    path = path.replace(/:(\w+)/g, '{$1}');
    path = path.trim();
    if (path && !path.startsWith('/')) {
        path = '/' + path;
    }
    return path;
}

function getRequestBody(request) {
    if (!request.body || !request.body.mimeType) return null;
    const { mimeType, params } = request.body;
    const schemaProps = {};
    if (params) {
        for (const param of params) {
            if (!param.name) continue;
            const paramName = param.name.replace(/\[.*?\]/g, '');
            schemaProps[paramName] = {
                type: 'string',
                description: param.description || '',
                example: param.value || ''
            };
            if (param.type === 'file') schemaProps[paramName].format = 'binary';
        }
    }
    return { content: { [mimeType]: { schema: { type: 'object', properties: schemaProps } } } };
}

function getParameters(request) {
    const params = [];
    const seenParams = new Map(); // Track params by "name:location" to deduplicate
    
    if (request.pathParameters) {
        for (const param of request.pathParameters) {
            if (!param.name) continue;
            const key = `${param.name}:path`;
            if (!seenParams.has(key)) {
                const paramObj = { name: param.name, in: 'path', required: true, schema: { type: 'string' }, description: param.description || '' };
                seenParams.set(key, paramObj);
                params.push(paramObj);
            }
        }
    }
    if (request.parameters) {
        for (const param of request.parameters) {
            if (!param.name) continue;
            const key = `${param.name}:query`;
            // If we already have this param, only replace if the new one is enabled and the old one was disabled
            if (seenParams.has(key)) {
                const existing = seenParams.get(key);
                if (!param.disabled && !existing.required) {
                    // New param is enabled, old was disabled - update to enabled
                    existing.required = true;
                }
                // Otherwise keep existing (first one wins)
            } else {
                const paramObj = { name: param.name, in: 'query', required: !param.disabled, schema: { type: 'string' }, description: param.description || '' };
                seenParams.set(key, paramObj);
                params.push(paramObj);
            }
        }
    }
    return params;
}

function processResources(allRequests, allRequestGroups, parentId, parentTag) {
    const paths = {};
    const children = [...allRequestGroups, ...allRequests].filter(r => r.parentId === parentId);
    for (const resource of children) {
        const resourceId = resource._id || '';
        if (resourceId.startsWith('fld_')) {
            const tag = resource.name || parentTag;
            const nestedPaths = processResources(allRequests, allRequestGroups, resource._id, tag);
            for (const [path, methods] of Object.entries(nestedPaths)) {
                if (!paths[path]) paths[path] = {};
                Object.assign(paths[path], methods);
            }
        } else if (resourceId.startsWith('req_')) {
            const pathUrl = convertUrlToPath(resource.url);
            if (!pathUrl) continue;
            const method = resource.method.toLowerCase();
            if (!paths[pathUrl]) paths[pathUrl] = {};
            const sanitizedPath = sanitizeForOperationId(pathUrl, true);
            const sanitizedName = sanitizeForOperationId(resource.name);
            const operationId = `${method}${sanitizedPath.charAt(0).toUpperCase() + sanitizedPath.slice(1)}${sanitizedName.charAt(0).toUpperCase() + sanitizedName.slice(1)}`;
            const operation = {
                summary: resource.name || 'No summary',
                description: resource.description || '',
                operationId: operationId,
                tags: parentTag ? [parentTag] : [],
                responses: { '200': { description: 'Successful' }, '400': { description: 'Bad Request' }, '500': { description: 'Server Error' } }
            };
            const parameters = getParameters(resource);
            if (parameters.length > 0) operation.parameters = parameters;
            const requestBody = getRequestBody(resource);
            if (requestBody) operation.requestBody = requestBody;
            paths[pathUrl][method] = operation;
        }
    }
    return paths;
}

module.exports.workspaceActions = [{
    label: 'Export to OpenAPI 3.0',
    icon: 'fa-file-export',
    action: async (context, models) => {
        try {
            // Method 1: Try with prompt as workaround
            const filename = await context.app.prompt(
                'Export OpenAPI Specification',
                {
                    label: 'Filename (will be saved to home directory)',
                    defaultValue: `${models.workspace.name}-openapi.yaml`,
                    submitName: 'Export'
                }
            );

            if (!filename) {
                return;
            }

            const openapiSpec = {
                openapi: '3.0.0',
                info: {
                    title: models.workspace.name,
                    version: '1.0.0',
                    description: models.workspace.description || '',
                },
                servers: [],
                paths: {}
            };

            const environments = models.environments || [];
            const requests = models.requests || [];
            const requestGroups = models.requestGroups || [];

            const baseEnv = environments.find(e => e.parentId === models.workspace._id);
            if (baseEnv && baseEnv.data) {
                const baseUrl = baseEnv.data.baseURL || baseEnv.data.base_url || baseEnv.data.baseUrl || baseEnv.data.BASE_URL;
                if (baseUrl) {
                    openapiSpec.servers.push({ url: baseUrl });
                } else {
                    openapiSpec.servers.push({ url: 'http://localhost' });
                }
            } else {
                openapiSpec.servers.push({ url: 'http://localhost' });
            }

            openapiSpec.paths = processResources(
                requests,
                requestGroups,
                models.workspace._id,
                models.workspace.name
            );

            const finalYaml = yaml.dump(openapiSpec, { indent: 2, sortKeys: false });

            // Save to user's home directory or Downloads folder
            const os = require('os');
            const homeDir = os.homedir();
            const savePath = path.join(homeDir, 'Downloads', filename);

            await fs.writeFile(savePath, finalYaml);

            context.app.alert('Success!', `OpenAPI spec exported to: ${savePath}`);

        } catch (err) {
            context.app.alert('Error!', `An error occurred during export: ${err.message}`);
        }
    },
}];