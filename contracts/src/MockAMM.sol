// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Like {
    function approve(address spender, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IPriceOracleLike {
    function getPrice(address token) external view returns (uint256);
}

contract MockAMM {
    IPriceOracleLike public immutable oracle;
    address public owner;
    uint256 public slippageBps;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event SlippageUpdated(uint256 slippageBps);
    event SwapExecuted(
        address indexed trader,
        address indexed sellToken,
        address indexed buyToken,
        uint256 sellAmount,
        uint256 buyAmount
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "ONLY_OWNER");
        _;
    }

    constructor(address oracle_) {
        require(oracle_ != address(0), "ZERO_ORACLE");
        oracle = IPriceOracleLike(oracle_);
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_OWNER");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function setSlippage(uint256 slippageBps_) external onlyOwner {
        require(slippageBps_ <= 10_000, "INVALID_SLIPPAGE");
        slippageBps = slippageBps_;
        emit SlippageUpdated(slippageBps_);
    }

    function quote(address sellToken, address buyToken, uint256 sellAmount) public view returns (uint256) {
        require(sellToken != address(0) && buyToken != address(0), "ZERO_TOKEN");
        require(sellAmount > 0, "ZERO_AMOUNT");

        uint256 sellPrice = oracle.getPrice(sellToken);
        uint256 buyPrice = oracle.getPrice(buyToken);
        uint256 grossBuyAmount = (sellAmount * sellPrice) / buyPrice;

        return (grossBuyAmount * (10_000 - slippageBps)) / 10_000;
    }

    function swap(
        address sellToken,
        address buyToken,
        uint256 sellAmount,
        uint256 minBuyAmount
    ) external returns (uint256 buyAmount) {
        buyAmount = quote(sellToken, buyToken, sellAmount);
        require(buyAmount >= minBuyAmount, "AMM_MIN_BUY_NOT_MET");

        require(IERC20Like(sellToken).transferFrom(msg.sender, address(this), sellAmount), "SELL_TRANSFER_FAILED");
        require(IERC20Like(buyToken).transfer(msg.sender, buyAmount), "BUY_TRANSFER_FAILED");

        emit SwapExecuted(msg.sender, sellToken, buyToken, sellAmount, buyAmount);
    }
}

