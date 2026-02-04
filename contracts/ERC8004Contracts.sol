// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ERC-8004 Trustless Agents - Simplified Implementation for Hackathon Demo
 *
 * These contracts implement the core functionality of ERC-8004:
 * - IdentityRegistry: Agent registration and identity management
 * - ReputationRegistry: Feedback and reputation scoring
 * - ValidationRegistry: Third-party validation requests
 */

// ============================================
// IDENTITY REGISTRY
// ============================================
contract IdentityRegistry {
    struct Agent {
        address owner;
        address wallet;
        string agentURI;
        uint256 registeredAt;
    }

    mapping(uint256 => Agent) public agents;
    uint256 public nextAgentId = 1;

    event Registered(uint256 indexed agentId, string agentURI, address indexed owner);
    event AgentURIUpdated(uint256 indexed agentId, string newURI);
    event WalletUpdated(uint256 indexed agentId, address newWallet);

    /**
     * Register a new agent identity
     */
    function register(string calldata agentURI) external returns (uint256 agentId) {
        agentId = nextAgentId++;

        agents[agentId] = Agent({
            owner: msg.sender,
            wallet: msg.sender,
            agentURI: agentURI,
            registeredAt: block.timestamp
        });

        emit Registered(agentId, agentURI, msg.sender);
    }

    /**
     * Update agent URI
     */
    function setAgentURI(uint256 agentId, string calldata newURI) external {
        require(agents[agentId].owner == msg.sender, "Not owner");
        agents[agentId].agentURI = newURI;
        emit AgentURIUpdated(agentId, newURI);
    }

    /**
     * Get agent wallet
     */
    function getAgentWallet(uint256 agentId) external view returns (address) {
        return agents[agentId].wallet;
    }

    /**
     * Get agent owner (ERC721-compatible)
     */
    function ownerOf(uint256 agentId) external view returns (address) {
        require(agents[agentId].owner != address(0), "Agent not found");
        return agents[agentId].owner;
    }

    /**
     * Get agent URI (ERC721-compatible)
     */
    function tokenURI(uint256 agentId) external view returns (string memory) {
        require(agents[agentId].owner != address(0), "Agent not found");
        return agents[agentId].agentURI;
    }
}

// ============================================
// REPUTATION REGISTRY
// ============================================
contract ReputationRegistry {
    struct Feedback {
        address client;
        int128 value;
        uint8 valueDecimals;
        string tag1;
        string tag2;
        string feedbackURI;
        uint256 timestamp;
        bool revoked;
    }

    // agentId => feedbacks
    mapping(uint256 => Feedback[]) public feedbacks;

    event NewFeedback(
        uint256 indexed agentId,
        address indexed clientAddress,
        uint64 feedbackIndex,
        int128 value,
        uint8 valueDecimals,
        string indexed indexedTag1,
        string tag1,
        string tag2
    );

    event FeedbackRevoked(uint256 indexed agentId, uint64 feedbackIndex);

    /**
     * Give feedback to an agent
     */
    function giveFeedback(
        uint256 agentId,
        int128 value,
        uint8 valueDecimals,
        string calldata tag1,
        string calldata tag2,
        string calldata, // endpoint (unused in simple version)
        string calldata feedbackURI,
        bytes32 // feedbackHash (unused in simple version)
    ) external {
        uint64 index = uint64(feedbacks[agentId].length);

        feedbacks[agentId].push(Feedback({
            client: msg.sender,
            value: value,
            valueDecimals: valueDecimals,
            tag1: tag1,
            tag2: tag2,
            feedbackURI: feedbackURI,
            timestamp: block.timestamp,
            revoked: false
        }));

        emit NewFeedback(agentId, msg.sender, index, value, valueDecimals, tag1, tag1, tag2);
    }

    /**
     * Revoke feedback
     */
    function revokeFeedback(uint256 agentId, uint64 feedbackIndex) external {
        require(feedbacks[agentId][feedbackIndex].client == msg.sender, "Not feedback owner");
        feedbacks[agentId][feedbackIndex].revoked = true;
        emit FeedbackRevoked(agentId, feedbackIndex);
    }

    /**
     * Get reputation summary
     */
    function getSummary(
        uint256 agentId,
        address[] calldata, // clientAddresses filter (simplified: ignore)
        string calldata,    // tag1 filter (simplified: ignore)
        string calldata     // tag2 filter (simplified: ignore)
    ) external view returns (uint64 count, int128 summaryValue, uint8 summaryValueDecimals) {
        Feedback[] storage fbs = feedbacks[agentId];
        int256 total = 0;
        uint64 validCount = 0;

        for (uint256 i = 0; i < fbs.length; i++) {
            if (!fbs[i].revoked) {
                total += int256(fbs[i].value);
                validCount++;
            }
        }

        if (validCount > 0) {
            summaryValue = int128(total / int256(uint256(validCount)));
        }

        return (validCount, summaryValue, 0);
    }

    /**
     * Get feedback count
     */
    function getFeedbackCount(uint256 agentId) external view returns (uint256) {
        return feedbacks[agentId].length;
    }
}

// ============================================
// VALIDATION REGISTRY
// ============================================
contract ValidationRegistry {
    struct ValidationRequest {
        address validator;
        uint256 agentId;
        uint8 response; // 0=pending, 1-100=score
        bytes32 responseHash;
        string tag;
        uint256 lastUpdate;
    }

    mapping(bytes32 => ValidationRequest) public requests;

    event ValidationRequested(
        bytes32 indexed requestHash,
        address indexed validator,
        uint256 indexed agentId
    );

    event ValidationResponded(
        bytes32 indexed requestHash,
        uint8 response,
        string tag
    );

    /**
     * Request validation from a validator
     */
    function validationRequest(
        address validatorAddress,
        uint256 agentId,
        string calldata, // requestURI (stored off-chain)
        bytes32 requestHash
    ) external {
        requests[requestHash] = ValidationRequest({
            validator: validatorAddress,
            agentId: agentId,
            response: 0,
            responseHash: bytes32(0),
            tag: "",
            lastUpdate: block.timestamp
        });

        emit ValidationRequested(requestHash, validatorAddress, agentId);
    }

    /**
     * Respond to validation request
     */
    function validationResponse(
        bytes32 requestHash,
        uint8 response,
        string calldata, // responseURI
        bytes32 responseHash,
        string calldata tag
    ) external {
        ValidationRequest storage req = requests[requestHash];
        require(req.validator == msg.sender, "Not validator");

        req.response = response;
        req.responseHash = responseHash;
        req.tag = tag;
        req.lastUpdate = block.timestamp;

        emit ValidationResponded(requestHash, response, tag);
    }

    /**
     * Get validation status
     */
    function getValidationStatus(bytes32 requestHash) external view returns (
        address validatorAddress,
        uint256 agentId,
        uint8 response,
        bytes32 responseHash,
        string memory tag,
        uint256 lastUpdate
    ) {
        ValidationRequest storage req = requests[requestHash];
        return (req.validator, req.agentId, req.response, req.responseHash, req.tag, req.lastUpdate);
    }
}

// ============================================
// FACTORY - Deploy all three contracts at once
// ============================================
contract ERC8004Factory {
    IdentityRegistry public identityRegistry;
    ReputationRegistry public reputationRegistry;
    ValidationRegistry public validationRegistry;

    event Deployed(
        address identityRegistry,
        address reputationRegistry,
        address validationRegistry
    );

    constructor() {
        identityRegistry = new IdentityRegistry();
        reputationRegistry = new ReputationRegistry();
        validationRegistry = new ValidationRegistry();

        emit Deployed(
            address(identityRegistry),
            address(reputationRegistry),
            address(validationRegistry)
        );
    }
}
