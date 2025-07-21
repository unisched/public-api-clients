/*
 * Paperless API client for JavaScript (Node.js, browser)
 * Copyright (C) 2025, Yurii Kadirov. All rights reserved.
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 * 
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

export class PaperlessClient {
    async getAuthCode(clientId) {
        const endpoint = 'https://paperless.com.ua/PplsService/oauth/authorize';
        let headers = new Headers();
        headers.append('Content-Type', 'application/x-www-form-urlencoded');
        headers.append('Accept', 'application/json');
        let urlencoded = new URLSearchParams();
        urlencoded.append('response_type', 'code');
        urlencoded.append('agentCheck', 'true');
        urlencoded.append('client_id', clientId);

        let response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: urlencoded,
            redirect: 'error'
        });
        if (!response.ok) {
            throw new PaperlessClientError('Auth code request failed: ' + response.status + ' ' + response.statusText);
        }

        let data = await response.json();
        if (data.state !== 'ok') {
            // noinspection JSUnresolvedReference
            throw new PaperlessClientError('Auth code not granted: ' + data.auth + ' ' + data.desc);
        }
        return data.code;
    }

    async getAuthToken(clientId, clientSecret, authCode) {
        const endpoint = 'https://paperless.com.ua/PplsService/oauth/token';
        let headers = new Headers();
        headers.append('Content-Type', 'application/x-www-form-urlencoded');
        headers.append('Accept', 'application/json');
        let urlencoded = new URLSearchParams();
        urlencoded.append('grant_type', 'authorization_code');
        urlencoded.append('client_id', clientId);
        urlencoded.append('client_secret', clientSecret);
        urlencoded.append('code', authCode);

        let response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: urlencoded,
            redirect: 'error'
        });
        if (!response.ok) {
            throw new PaperlessClientError('Authorization request failed: ' + response.status + ' ' + response.statusText);
        }

        let data = await response.json();
        if ('error' in data) {
            // noinspection JSUnresolvedReference
            throw new PaperlessClientError('Authorization failed: ' + data.error + ' ' + data.error_description);
        }
        return data;
    }

    async uploadDocument(clientId, accessToken, fileBytes, fileName) {
        const endpoint = 'https://paperless.com.ua/api2/checked/upload';
        const boundary = Math.random().toString(36).slice(2);
        let headers = new Headers();
        headers.append('accept', 'application/json');
        headers.append('Content-Type', `multipart/form-data; boundary=${boundary}; charset=UTF-8`);
        headers.append('Cookie', `sessionId=\"Bearer ${accessToken}, Id ${clientId}\"`);

        let bodyContent = `--${boundary}\nContent-Disposition: form-data; name=\"file\"; filename=\"${fileName}\"\n`
            + `Content-Type: application/octet-stream\nContent-Transfer-Encoding: binary\n\n${fileBytes}\n--${boundary}--`;

        let response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: bodyContent,
            redirect: 'error'
        });
        if (!response.ok) {
            throw new PaperlessClientError(`Upload failed: ${response.status} ${response.statusText}`);
        }
    }

    async searchDocuments(clientId, accessToken, searchFilter) {
        if (!(searchFilter instanceof PaperlessDocumentSearchFilter)) {
            throw new PaperlessClientError('searchFilter must be an instance of PaperlessDocumentSearchFilter');
        }

        const endpoint = 'https://paperless.com.ua/api2/checked/resource/search';
        let headers = new Headers();
        headers.append('accept', 'application/json');
        headers.append('Content-Type', 'application/json; charset=UTF-8');
        headers.append('Cookie', `sessionId=\"Bearer ${accessToken}, Id ${clientId}\"`);
        let bodyContent = searchFilter.convertToJson();

        let response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: bodyContent,
            redirect: 'error'
        });
        if (!response.ok) {
            throw new PaperlessClientError(`Search failed: ${response.status} ${response.statusText}`);
        }
        return await response.json();
    }

    async getDocmentInfo(clientId, accessToken, documentId) {
        const endpoint = `https://paperless.com.ua/api2/checked/resource/${documentId}`;
        let headers = new Headers();
        headers.append('Cookie', `sessionId=\"Bearer ${accessToken}, Id ${clientId}\"`);
        headers.append('Accept', 'application/json');

        let response = await fetch(endpoint, {
            method: 'GET',
            headers: headers,
            redirect: 'error'
        });
        if (!response.ok) {
            throw new PaperlessClientError(`Document info fetch failed: ${response.status} ${response.statusText}`);
        }
        return await response.json();
    }

    /**
     * Fetches the document file (signed or unsigned)
     * @param clientId
     * @param accessToken
     * @param documentId
     * @param documentHash
     * @param signed True to fetch a signed document, false for unsigned
     * @returns {Promise<Blob>} Blob of the document file in PDF format
     */
    async getDocumentFile(clientId, accessToken, documentId, documentHash, signed = false) {
        const endpointPartialRoute = signed ? 'withsign' : 'withoutsign';
        const endpoint = `https://paperless.com.ua/api2/checked/resource/${endpointPartialRoute}/${documentId}/${documentHash}`;
        let headers = new Headers();
        headers.append('Cookie', `sessionId=\"Bearer ${accessToken}, Id ${clientId}\"`);
        headers.append('Accept', 'application/json');

        let response = await fetch(endpoint, {
            method: 'GET',
            headers: headers,
            redirect: 'follow'
        });
        if (!response.ok) {
            throw new PaperlessClientError(`Document fetch failed: ${response.status} ${response.statusText}`);
        }
        return await response.blob();
    }

    async renameDocument(clientId, accessToken, documentId, newName) {
        const endpoint = `https://paperless.com.ua/api2/checked/resource/name/${documentId}`;
        let headers = new Headers();
        headers.append('Cookie', `sessionId=\"Bearer ${accessToken}, Id ${clientId}\"`);

        let response = await fetch(endpoint, {
            method: 'PUT',
            headers: headers,
            body: newName,
            redirect: 'error'
        });
        if (!response.ok) {
            throw new PaperlessClientError(`Rename document failed: ${response.status} ${response.statusText}`);
        }
    }

    async trashOrDeleteDocument(clientId, accessToken, documentId) {
        const endpoint = `https://paperless.com.ua/api2/checked/resource/${documentId}`;
        let headers = new Headers();
        headers.append('Cookie', `sessionId=\"Bearer ${accessToken}, Id ${clientId}\"`);

        let response = await fetch(endpoint, {
            method: 'DELETE',
            headers: headers,
            redirect: 'error'
        });
        if (!response.ok) {
            throw new PaperlessClientError(`Remove document failed: ${response.status} ${response.statusText}`);
        }
    }

    async restoreDocumentFromTrash(clientId, accessToken, documentId) {
        const endpoint = `https://paperless.com.ua/api2/checked/resource/restore/${documentId}`;
        let headers = new Headers();
        headers.append('Cookie', `sessionId=\"Bearer ${accessToken}, Id ${clientId}\"`);

        let response = await fetch(endpoint, {
            method: 'PUT',
            headers: headers,
            redirect: 'error'
        });
        if (!response.ok) {
            throw new PaperlessClientError(`Remove document failed: ${response.status} ${response.statusText}`);
        }
    }

    async setDocumentSharingByUrl(clientId, accessToken, documentId, setEnabled) {
        const endpoint = `https://paperless.com.ua/api2/checked/resource/shareall/${documentId}`;
        let headers = new Headers();
        headers.append('Cookie', `sessionId=\"Bearer ${accessToken}, Id ${clientId}\"`);

        let response = await fetch(endpoint, {
            method: setEnabled ? 'PUT' : 'DELETE',
            headers: headers,
            redirect: 'error'
        });
        if (!response.ok) {
            throw new PaperlessClientError(`Sharing document failed: ${response.status} ${response.statusText}`);
        }
    }

    getDocumentSharingUrl(documenntId, doocumentHash) {
        if (!documenntId || !doocumentHash) {
            throw new PaperlessClientError('Document ID and hash must be provided to generate sharing URL');
        }
        return `https://paperless.com.ua/share/${doocumentHash}${documenntId}`;
    }

    async getDocumentSignatures(clientId, accessToken, documentId) {
        const endpoint = `https://paperless.com.ua/api2/checked/sign/${documentId}`;
        let headers = new Headers();
        headers.append('Cookie', `sessionId=\"Bearer ${accessToken}, Id ${clientId}\"`);

        let response = await fetch(endpoint, {
            method: 'GET',
            headers: headers,
            redirect: 'error'
        });
        if (!response.ok) {
            throw new PaperlessClientError(`Sharing document failed: ${response.status} ${response.statusText}`);
        }
        return await response.json();
    }

    async addDocumentSignature(clientId, accessToken, documentId, signatureData, keyType = 'PERSONAL_KEY') {
        const endpoint = `https://paperless.com.ua/api2/checked/sign/0?keyType=${keyType}`;
        let headers = new Headers();
        headers.append('accept', 'application/json');
        headers.append('Content-Type', 'text/plain; charset=UTF-8');
        headers.append('Cookie', `sessionId=\"Bearer ${accessToken}, Id ${clientId}\"`);

        let rawRequest = JSON.stringify({
            [documentId]: [ signatureData ]
        });

        let response = await fetch(endpoint, {
            method: 'POST',
            headers: headers,
            body: rawRequest,
            redirect: 'error'
        });
        if (!response.ok) {
            throw new PaperlessClientError(`Signing document failed: ${response.status} ${response.statusText}`);
        }
    }
}

export class PaperlessDocumentSearchFilter {
    constructor(
        searchQuery = '',
        contractor = null,
        author = 'all',
        signed = null,
        dateFrom = null,
        dateTo = null,
        docList = 'docs',
        offset = 0,
        limit = 40
    ) {
        this.searchQuery = searchQuery;
        this.contractor = contractor;
        this.author = author;
        this.signed = signed;
        this.dateFrom = dateFrom;
        this.dateTo = dateTo;
        this.docList = docList;
        this.offset = offset;
        this.limit = limit;
    }

    convertToJson() {
        return JSON.stringify({
            'searchQuery': this.searchQuery,
            'contractor': this.contractor,
            'author': this.author,
            'signed': this.signed,
            'dateFrom': this.dateFrom,
            'dateTo': this.dateTo,
            'docList': this.docList,
            'offset': this.offset,
            'limit': this.limit
        });
    }
}

export class PaperlessClientError extends Error {
    constructor(message) {
        super(message);
        this.name = 'PaperlessClientError';
    }
}
