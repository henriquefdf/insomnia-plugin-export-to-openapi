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
    let path = url.replace(/\{\{.*?base_url.*?\}\}/g, '');
    path = path.replace(/\?.*$/, '');
    path = path.replace(/:(\w+)/g, '{$1}');
    return path.trim();
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
    if (request.pathParameters) {
        for (const param of request.pathParameters) {
            if (param.name) params.push({ name: param.name, in: 'path', required: true, schema: { type: 'string' }, description: param.description || '' });
        }
    }
    if (request.parameters) {
        for (const param of request.parameters) {
            if (param.name) params.push({ name: param.name, in: 'query', required: !param.disabled, schema: { type: 'string' }, description: param.description || '' });
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
            if (baseEnv && baseEnv.data && baseEnv.data.base_url) {
                openapiSpec.servers.push({ url: baseEnv.data.base_url });
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