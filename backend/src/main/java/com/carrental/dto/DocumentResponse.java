package com.carrental.dto;

public class DocumentResponse {
    private Long id;
    private String docType;
    private String docUrl;
    private String verificationStatus;
    private String rejectionReason;
    private String createdAt;

    public DocumentResponse() {}

    public DocumentResponse(Long id, String docType, String docUrl, String verificationStatus,
                            String rejectionReason, String createdAt) {
        this.id = id;
        this.docType = docType;
        this.docUrl = docUrl;
        this.verificationStatus = verificationStatus;
        this.rejectionReason = rejectionReason;
        this.createdAt = createdAt;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getDocType() { return docType; }
    public void setDocType(String docType) { this.docType = docType; }
    public String getDocUrl() { return docUrl; }
    public void setDocUrl(String docUrl) { this.docUrl = docUrl; }
    public String getVerificationStatus() { return verificationStatus; }
    public void setVerificationStatus(String verificationStatus) { this.verificationStatus = verificationStatus; }
    public String getRejectionReason() { return rejectionReason; }
    public void setRejectionReason(String rejectionReason) { this.rejectionReason = rejectionReason; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
}
