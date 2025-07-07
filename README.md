# Insomnia OpenAPI 3.0 Exporter

[](https://www.npmjs.com/package/insomnia-plugin-openapi-converter)
[](https://opensource.org/licenses/MIT)

An Insomnia plugin to export your current collection to an OpenAPI 3.0 specification file in YAML format. It intelligently preserves your folder structure as tags, making your API documentation clean and organized.

-----

## Key Features

  - **One-Click Export:** Adds a simple "Export to OpenAPI 3.0" option to your workspace menu.
  - **Preserves Folder Structure:** Automatically converts your Insomnia request folders and sub-folders into OpenAPI `tags`, keeping your documentation organized just like your collection.
  - **OpenAPI 3.0 Compliant:** Generates a valid OpenAPI 3.0 specification in YAML format.
  - **Handles Various Request Types:** Correctly processes path parameters, query parameters, and request bodies for `application/x-www-form-urlencoded`, `multipart/form-data`, and more.
  - **User-Friendly:** Prompts you to choose a save location for the exported file.

## Installation

1.  Open Insomnia.
2.  Go to **Application** \> **Preferences** \> **Plugins**.
3.  Type `insomnia-plugin-openapi-converter` and click **Install Plugin**.
4.  That's it\! No configuration is needed.

## Usage

1.  Click on your collection/workspace name in the top-left corner of Insomnia.
2.  From the dropdown menu, select **Export to OpenAPI 3.0**.
3.  A "Save As" dialog will appear. Choose a name and location for your `openapi.yaml` file.
4.  Click **Save**. A confirmation alert will appear upon successful export.

The resulting YAML file can be used with any tool that supports the OpenAPI specification, such as Swagger UI, Redoc, or Postman.

## How It Works

This plugin hooks into Insomnia's workspace actions. When triggered, it:

1.  Reads the entire data model of the current workspace, including requests, request groups (folders), and environments.
2.  Recursively processes the folder structure, mapping each folder to an OpenAPI tag.
3.  Iterates through each request, converting its URL, method, parameters, and body into the corresponding OpenAPI path operation object.
4.  Bundles everything into a valid OpenAPI 3.0 specification.
5.  Uses `js-yaml` to serialize the final object into a clean YAML string.

## Contributing

Contributions are welcome\! If you have a suggestion or find a bug, please feel free to:

  - Open an issue on the [GitHub repository](https://www.google.com/search?q=https://github.com/seu-usuario/insomnia-plugin-openapi-converter/issues).
  - Fork the repository and submit a pull request.

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.