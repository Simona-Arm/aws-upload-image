/**
 * S3MultiUpload Object
 * Create a new instance with new S3MultiUpload(file)
 * To start uploading, call start()
 * You can pause with pause()
 * Resume with resume()
 * Cancel with cancel()
 *
 * You can override the following functions (no event emitter :( , description below on the function definition, at the end of the file)
 * onServerError = function(command, jqXHR, textStatus, errorThrown) {}
 * onS3UploadError = function(xhr) {}
 * onProgressChanged = function(uploadingSize, uploadedSize, totalSize) {}
 * onUploadCompleted = function() {}
 *
 * @param {type} file
 * @returns {MultiUpload}
 */
class S3MultiUpload {
    constructor(file) {
        this.PART_SIZE = 5 * 1024 * 1024; //minimum part size defined by aws s3
        this.SERVER_LOC = 'http://localhost:3000/aws-upload'; //location of the server
        this.RETRY_WAIT_SEC = 30; //wait before retrying again on upload failure
        this.file = file;
        this.fileInfo = {
            name: this.file.name,
            type: this.file.type,
            size: this.file.size,
            lastModifiedDate: this.file.lastModifiedDate
        };
        this.uploadId = null;
        this.key = null;
        this.isPaused = false;
        this.uploadXHR = null;
        this.uploadedSize = 0;
        this.uploadingSize = 0;
        this.progress = [];
        this.uploadParts = [];
    
        if (console && console.log) {
            this.log = console.log;
        } else {
            this.log = function() {
            };
        }
    }
    
    /** private */
    createMultipartUpload() {
        const url = new URL(this.SERVER_LOC);
        const params = {
            command: 'CreateMultipartUpload',
            fileName: this.fileInfo.name,
            contentType: this.fileInfo.type
        }
        url.search = new URLSearchParams(params).toString();

        fetch(url)
        .then((response) => response.json())
        .then(data => {
            this.uploadId = data.uploadId;
            this.key = data.key;
            this.uploadAll();
        })
        .catch(this.onServerError.bind(this));
    };

    /**
     * Call this function to start uploading to server
     *
     */
    start() {
        let start = 0, end = 0, blob, i = 0;

        while (end < this.file.size) {
            start = this.PART_SIZE * i;
            end = Math.min(start + this.PART_SIZE, this.file.size);
            blob = this.file.slice(start, end);
            this.uploadParts.push({blob});
            i++;
        }

        this.createMultipartUpload();
    };

    async uploadAll() {
        const promises = [];

        for (let i = 0; i < this.uploadParts.length; i++) {
            if (this.uploadParts.eTag) {
                continue;
            }
            const url = new URL(this.SERVER_LOC);
            const params = {
                command: 'SignUploadPart',
                uploadId: this.uploadId,
                key: this.key,
                partNumber: i + 1,
                contentLength: this.uploadParts[i].blob.size
            }
            url.search = new URLSearchParams(params).toString();
            promises.push(fetch(url));
        }

        const responses = await Promise.all(promises);
        const data = await Promise.all(responses.map(r => r.json()));

        for (let i = 0; i < data.length; i++) {
            this.sendToS3(data[i], this.uploadParts[+data[i].partNumber - 1].blob, +data[i].partNumber - 1);
        }
    }

    sendToS3(data, blob, index) {
        var url = data['url'];
        var size = blob.size;

        var request = this.uploadXHR = new XMLHttpRequest();
        request.onreadystatechange = () => {
            if (request.readyState === XMLHttpRequest.DONE) {
                this.uploadXHR = null;
                this.progress[index] = 100;
                if (request.status !== 200) {
                    this.updateProgressBar();
                    if (!this.isPaused)
                    this.onS3UploadError(request);
                    return;
                }
                this.uploadedSize += blob.size;
                this.updateProgressBar();
                this.uploadParts[index].eTag = request.getResponseHeader("ETag");
                if (this.uploadParts.find(e => !e.eTag) === undefined) {
                    this.completeMultipartUpload();
                }
            }
        };

        request.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                this.progress[index] = e.loaded / size;
                this.updateProgressBar();
            }
        };
        request.open('PUT', url, true);
        request.setRequestHeader("Content-Type", this.file.type);
        request.send(blob);
    };

    /**
     * Pause the upload
     * Remember, the current progressing part will fail,
     * that part will start from beginning (< 5MB of uplaod is wasted)
     */
    pause() {
        this.isPaused = true;
        if (this.uploadXHR !== null) {
            this.uploadXHR.abort();
        }
    };

    /**
     * Resumes the upload
     *
     */
    resume() {
        this.isPaused = false;
        this.uploadAll();
    };

    cancel() {
        this.pause();
        const url = new URL(this.SERVER_LOC);
        const params = {
            command: 'AbortMultipartUpload',
            key: this.key,
            uploadId: this.uploadId
        };
        url.search = new URLSearchParams(params).toString();

        fetch(url)
        .then((response) => response.json())
        .then((data) => {
            console.log('Canceled', data);
        });
    };

    waitRetry() {
        setTimeout(() => {
            this.retry();
        }, this.RETRY_WAIT_SEC * 1000);
    };

    retry() {
        if (!this.isPaused && this.uploadXHR === null) {
            this.uploadAll();
        }
    };

    completeMultipartUpload() {
        const url = new URL(this.SERVER_LOC + '/CompleteMultipartUpload');
        const params = {
            key: this.key,
            uploadId: this.uploadId,
            parts: this.uploadParts.map((p, i) => ({ETag: p.eTag, PartNumber: i + 1}))
        }
        fetch(url, {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(params)
        })
        .then(this.onUploadCompleted.bind(this))
        .catch(this.onServerError.bind(this))
    };

    updateProgressBar() {
        var progress = this.progress;
        var length = progress.length;
        var total = 0;
        for (var i = 0; i < progress.length; i++) {
            total = total + progress[i];
        }
        total = total / length;

        this.onProgressChanged(this.uploadingSize, total, this.file.size);
    };

    /**
     * Overrride this function to catch errors occured when communicating to your server
     * If this occurs, the program stops, you can retry by retry() or wait and retry by waitRetry()
     *
     * @param {type} err
     */
    onServerError(err) {
    };

    /**
     * Overrride this function to catch errors occured when uploading to S3
     * If this occurs, we retry upload after RETRY_WAIT_SEC seconds
     * Most of the time you don't need to override this, except for informing user that upload of a part failed
     *
     * @param XMLHttpRequest xhr the XMLHttpRequest object
     */
    onS3UploadError(xhr) {
        this.waitRetry();
    };

    /**
     * Override this function to show user update progress
     *
     * @param {type} uploadingSize is the current upload part
     * @param {type} uploadedSize is already uploaded part
     * @param {type} totalSize the total size of the uploading file
     */
    onProgressChanged(uploadingSize, uploadedSize, totalSize) {
        this.log("uploadedSize = " + uploadedSize);
        this.log("uploadingSize = " + uploadingSize);
        this.log("totalSize = " + totalSize);
    };

    /**
     * Override this method to execute something when upload finishes
     *
     */
    onUploadCompleted(serverData) {

    };
}